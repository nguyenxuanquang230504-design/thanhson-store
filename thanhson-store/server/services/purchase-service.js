const mongoose = require('mongoose');
const Product = require('../models/product');
const Order = require('../models/order');
const productRepository = require('../../data/product-repository');
const orderService = require('./order-service');
const { toCustomerOrder } = require('./order-view');
const { hashAccessToken } = require('../lib/order-security');
const InventoryError = require('../lib/inventory-error');
const { isMongoConnected } = require('../lib/mongo');
const { nodeEnv } = require('../config');

function assertIdempotentMatch(order, orderContext) {
  if (order.idempotencyFingerprint !== orderContext.idempotencyFingerprint
    || order.ownerKeyHash !== orderContext.ownerKeyHash) {
    throw new InventoryError('Mã đặt hàng đã được sử dụng với thông tin khác. Vui lòng tải lại trang thanh toán.', 409);
  }
}

function localSummary(lines) {
  const items = lines.map(line => {
    const product = productRepository.findById(line.id);
    if (!product) throw new InventoryError('Sản phẩm không còn tồn tại.');
    const variant = (product.variants || []).find(item => String(item._id || item.id) === String(line.variantId || ''));
    const price = Number(product.salePrice != null ? product.salePrice : product.price) + Number(variant?.priceAdjustment || 0);
    return {
      ...line,
      product,
      variant: variant || null,
      price,
      subtotal: price * line.qty
    };
  });
  return {
    items,
    totalQty: items.reduce((total, item) => total + item.qty, 0),
    totalAmount: items.reduce((total, item) => total + item.subtotal, 0)
  };
}

async function placeOrder({ cartItems, customer, user, discountRate, paymentMethod, orderContext }) {
  if (!Array.isArray(cartItems) || !cartItems.length) throw new InventoryError('Giỏ hàng đang trống.', 400);
  if (!orderContext?.idempotencyKey || !orderContext?.idempotencyFingerprint || !orderContext?.ownerKeyHash) {
    throw new InventoryError('Không thể xác thực yêu cầu đặt hàng. Vui lòng tải lại trang thanh toán.', 400);
  }
  const hasMongoIds = cartItems.every(item => mongoose.isValidObjectId(item.id));
  const hasJsonIds = cartItems.every(item => !mongoose.isValidObjectId(item.id));
  if (hasMongoIds && isMongoConnected()) {
    return placeMongoOrder({ cartItems, customer, user, discountRate, paymentMethod, orderContext });
  }
  if (!hasJsonIds || nodeEnv !== 'development') throw new InventoryError('Giỏ hàng chứa sản phẩm từ nhiều nguồn hoặc chưa kết nối kho. Vui lòng tải lại giỏ hàng.', 409);

  const existing = orderService.findByIdempotencyKey(orderContext.idempotencyKey);
  if (existing) {
    assertIdempotentMatch(existing, orderContext);
    return existing;
  }
  productRepository.adjustStock(cartItems, -1);
  try {
    const summary = localSummary(cartItems);
    const order = orderService.createOrder({
      summary, customer, user, discountRate, paymentMethod, ...orderContext
    });
    const saved = orderService.saveOrder(order);
    assertIdempotentMatch(saved, orderContext);
    return saved;
  } catch (error) {
    productRepository.adjustStock(cartItems, 1);
    throw error;
  }
}

async function placeMongoOrder({ cartItems, customer, user, discountRate, paymentMethod, orderContext }) {
  const session = await mongoose.startSession();
  let placedOrder = null;
  try {
    await session.withTransaction(async () => {
      const previous = await Order.findOne({ idempotencyKey: orderContext.idempotencyKey }).session(session).lean();
      if (previous) {
        assertIdempotentMatch(previous, orderContext);
        placedOrder = previous;
        return;
      }

      const items = [];
      for (const line of cartItems) {
        const qty = Number(line.qty);
        if (!Number.isSafeInteger(qty) || qty < 1) throw new InventoryError('Số lượng đặt không hợp lệ.', 400);
        const productId = new mongoose.Types.ObjectId(line.id);
        const current = await Product.findOne({ _id: productId, productStatus: 'PUBLISHED' }).session(session);
        if (!current) throw new InventoryError('Sản phẩm không còn được bán.');
        const hasVariants = current.variants.length > 0;
        if (hasVariants && !line.variantId) throw new InventoryError(`Vui lòng chọn phân loại cho ${current.name}.`, 400);
        if (!hasVariants && line.variantId) throw new InventoryError('Phân loại sản phẩm không hợp lệ.', 409);

        let variant = null;
        let updated;
        if (hasVariants) {
          if (!mongoose.isValidObjectId(line.variantId)) throw new InventoryError('Phân loại sản phẩm không hợp lệ.', 400);
          const variantId = new mongoose.Types.ObjectId(line.variantId);
          variant = current.variants.id(variantId);
          if (!variant || variant.available === false) throw new InventoryError('Phân loại sản phẩm không còn bán.');
          updated = await Product.findOneAndUpdate({
            _id: productId,
            productStatus: 'PUBLISHED',
            variants: { $elemMatch: { _id: variantId, available: { $ne: false }, stock: { $gte: qty } } }
          }, {
            $inc: { 'variants.$[selected].stock': -qty },
            $set: { updatedAt: new Date() }
          }, {
            new: true,
            session,
            arrayFilters: [{ 'selected._id': variantId, 'selected.available': { $ne: false }, 'selected.stock': { $gte: qty } }]
          });
          if (!updated) throw new InventoryError(`Không đủ tồn kho cho ${current.name} (${variant.size || ''} ${variant.color || ''}).`.trim());
          const updatedVariant = updated.variants.id(variantId);
          const aggregateStock = updated.variants.reduce((total, item) => total + Number(item.stock || 0), 0);
          await Product.updateOne({ _id: productId }, { $set: { stock: aggregateStock, updatedAt: new Date() } }, { session });
          variant = updatedVariant;
        } else {
          updated = await Product.findOneAndUpdate({
            _id: productId,
            productStatus: 'PUBLISHED',
            stock: { $gte: qty }
          }, {
            $inc: { stock: -qty },
            $set: { updatedAt: new Date() }
          }, { new: true, session });
          if (!updated) throw new InventoryError(`Không đủ tồn kho cho ${current.name}.`);
        }

        const basePrice = current.salePrice != null ? Number(current.salePrice) : Number(current.price);
        const price = basePrice + Number(variant?.priceAdjustment || 0);
        items.push({
          id: String(current._id),
          productId: current._id,
          variantId: variant?._id || null,
          variant: variant || null,
          product: {
            name: current.name,
            image: current.image || current.images[0] || '',
            sku: current.sku,
            price: basePrice
          },
          qty,
          price,
          subtotal: price * qty
        });
      }

      const summary = {
        items,
        totalQty: items.reduce((total, item) => total + item.qty, 0),
        totalAmount: items.reduce((total, item) => total + item.subtotal, 0)
      };
      const order = orderService.createOrder({
        summary, customer, user, discountRate, paymentMethod, ...orderContext
      });
      const [saved] = await Order.create([order], { session });
      placedOrder = saved.toObject();
    });
  } catch (error) {
    if (error.code === 11000) {
      const previous = await Order.findOne({ idempotencyKey: orderContext.idempotencyKey }).lean();
      if (previous) {
        assertIdempotentMatch(previous, orderContext);
        return previous;
      }
    }
    if (error.code === 20 || /transaction numbers are only allowed/i.test(error.message)) {
      throw new InventoryError('MongoDB transactions are required for checkout; connect to a replica set.', 503);
    }
    throw error;
  } finally {
    await session.endSession();
  }
  return placedOrder;
}

async function restoreInventory(order, session) {
  if (order.inventoryRestoredAt || !order.inventoryDeductedAt) return;
  for (const item of order.items) {
    let result;
    if (item.variantId) {
      result = await Product.updateOne(
        { _id: item.productId, variants: { $elemMatch: { _id: item.variantId } } },
        { $inc: { 'variants.$[selected].stock': item.qty }, $set: { updatedAt: new Date() } },
        { session, arrayFilters: [{ 'selected._id': item.variantId }] }
      );
      if (!result.matchedCount) throw new InventoryError('Không thể phục hồi tồn kho biến thể của đơn hàng.', 409);
      const product = await Product.findById(item.productId).select('variants').session(session);
      const stock = product.variants.reduce((total, variant) => total + Number(variant.stock || 0), 0);
      await Product.updateOne({ _id: item.productId }, { $set: { stock, updatedAt: new Date() } }, { session });
    } else {
      result = await Product.updateOne(
        { _id: item.productId },
        { $inc: { stock: item.qty }, $set: { updatedAt: new Date() } },
        { session }
      );
      if (!result.matchedCount) throw new InventoryError('Không thể phục hồi tồn kho sản phẩm của đơn hàng.', 409);
    }
  }
  order.inventoryRestoredAt = new Date();
}

async function expirePendingMongoOrder(id) {
  const session = await mongoose.startSession();
  let expired = false;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({ id }).session(session);
      if (!order || order.status !== 'pending' || order.paymentMethod !== 'bank_transfer'
        || order.paymentStatus !== 'pending' || !order.paymentExpiresAt || order.paymentExpiresAt > new Date()) return;
      await restoreInventory(order, session);
      order.status = 'failed';
      order.paymentStatus = 'expired';
      order.statusHistory.push({ status: 'failed', changedAt: new Date(), actor: 'system' });
      order.paymentHistory.push({ status: 'expired', changedAt: new Date(), actor: 'system' });
      await order.save({ session });
      expired = true;
    });
  } finally {
    await session.endSession();
  }
  return expired;
}

async function expirePendingMongoOrders() {
  const dueOrders = await Order.find({
    status: 'pending',
    paymentMethod: 'bank_transfer',
    paymentStatus: 'pending',
    paymentExpiresAt: { $lte: new Date() }
  }).select('id').limit(100).lean();
  for (const order of dueOrders) await expirePendingMongoOrder(order.id);
}

function customerDto(order) {
  const paymentQrUrl = order.paymentMethod === 'bank_transfer' ? orderService.buildPaymentQrUrl(order) : '';
  return toCustomerOrder(order, { paymentQrUrl });
}

async function getCustomerOrderById(id, { customerId = '', username = '' } = {}) {
  if (!id || (!customerId && !username)) return null;
  const ownerMatch = [];
  if (customerId) ownerMatch.push({ customerId });
  if (username) ownerMatch.push({ 'user.username': username });
  if (isMongoConnected()) {
    let order = await Order.findOne({ id, $or: ownerMatch }).lean();
    if (order) {
      await expirePendingMongoOrder(order.id);
      order = await Order.findOne({ id, $or: ownerMatch }).lean();
      return order ? customerDto(order) : null;
    }
  }
  const localOrder = orderService.getOrderById(id);
  const localOrderOwned = localOrder && (
    (customerId && localOrder.customerId === customerId)
    || (username && localOrder.user?.username === username)
  );
  if (!localOrderOwned) return null;
  return customerDto(localOrder);
}

async function getCustomerOrderByAccessToken(token) {
  const tokenHash = hashAccessToken(token);
  if (!tokenHash) return null;
  if (isMongoConnected()) {
    let order = await Order.findOne({ guestAccessTokenHash: tokenHash }).lean();
    if (order) {
      await expirePendingMongoOrder(order.id);
      order = await Order.findOne({ guestAccessTokenHash: tokenHash }).lean();
      return order ? customerDto(order) : null;
    }
  }
  const localOrder = orderService.getByAccessTokenHash(tokenHash);
  return localOrder ? customerDto(localOrder) : null;
}

async function cancelMongoOrder(id, actor = 'admin') {
  const session = await mongoose.startSession();
  let cancelledOrder = null;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({ id }).session(session);
      if (!order) throw new InventoryError('Không tìm thấy đơn hàng.', 404);
      if (order.status === 'cancelled') {
        cancelledOrder = order.toObject();
        return;
      }
      if (!['pending', 'confirmed', 'processing'].includes(order.status) || order.paymentStatus === 'paid') {
        throw new InventoryError('Không thể hủy đơn hàng ở trạng thái hiện tại hoặc đã thanh toán.', 409);
      }
      await restoreInventory(order, session);
      order.status = 'cancelled';
      order.statusHistory.push({ status: 'cancelled', changedAt: new Date(), actor });
      if (['pending', 'unpaid'].includes(order.paymentStatus)) {
        order.paymentStatus = 'cancelled';
        order.paymentHistory.push({ status: 'cancelled', changedAt: new Date(), actor });
      }
      await order.save({ session });
      cancelledOrder = order.toObject();
    });
  } finally {
    await session.endSession();
  }
  return cancelledOrder;
}

async function transitionMongoOrder(id, nextStatus, actor = 'admin') {
  const transitions = {
    pending: ['confirmed', 'failed'],
    confirmed: ['processing'],
    processing: ['shipped'],
    shipped: ['delivered']
  };
  if (!Object.prototype.hasOwnProperty.call(transitions, nextStatus) && nextStatus !== 'cancelled') {
    throw new InventoryError('Trạng thái đơn hàng không hợp lệ.', 400);
  }
  if (nextStatus === 'cancelled') return cancelMongoOrder(id, actor);

  const session = await mongoose.startSession();
  let updatedOrder = null;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({ id }).session(session);
      if (!order) throw new InventoryError('Không tìm thấy đơn hàng.', 404);
      if (!transitions[order.status]?.includes(nextStatus)) throw new InventoryError('Không thể chuyển đơn hàng sang trạng thái này.', 409);
      if (nextStatus === 'confirmed' && order.paymentMethod === 'bank_transfer' && order.paymentStatus !== 'paid') {
        throw new InventoryError('Chỉ xác nhận đơn chuyển khoản sau khi đã xác minh thanh toán.', 409);
      }
      if (nextStatus === 'failed') {
        if (order.paymentStatus === 'paid') throw new InventoryError('Không thể đánh dấu thất bại cho đơn đã thanh toán.', 409);
        await restoreInventory(order, session);
        if (order.paymentMethod === 'bank_transfer' && order.paymentStatus === 'pending') {
          order.paymentStatus = 'failed';
          order.paymentHistory.push({ status: 'failed', changedAt: new Date(), actor });
        }
      }
      order.status = nextStatus;
      order.statusHistory.push({ status: nextStatus, changedAt: new Date(), actor });
      await order.save({ session });
      updatedOrder = order.toObject();
    });
  } finally {
    await session.endSession();
  }
  return updatedOrder;
}

async function verifyMongoPayment(id, outcome, actor = 'admin') {
  if (!['paid', 'failed'].includes(outcome)) throw new InventoryError('Trạng thái thanh toán không hợp lệ.', 400);
  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({ id }).session(session);
      if (!order) throw new InventoryError('Không tìm thấy đơn hàng.', 404);
      const now = new Date();
      const expired = order.paymentMethod === 'bank_transfer' && order.paymentStatus === 'pending'
        && order.paymentExpiresAt && order.paymentExpiresAt <= now;
      if (expired) {
        await restoreInventory(order, session);
        order.status = 'failed';
        order.paymentStatus = 'expired';
        order.statusHistory.push({ status: 'failed', changedAt: now, actor: 'system' });
        order.paymentHistory.push({ status: 'expired', changedAt: now, actor: 'system' });
        await order.save({ session });
        result = { order: order.toObject(), expired: true };
        return;
      }
      if (order.paymentStatus === outcome) {
        result = { order: order.toObject(), unchanged: true };
        return;
      }
      const allowedPayment = order.paymentStatus === 'pending'
        || (order.paymentMethod === 'cod' && order.status === 'delivered' && order.paymentStatus === 'unpaid');
      if (!allowedPayment || !['pending', 'confirmed', 'processing', 'shipped', 'delivered'].includes(order.status)) {
        throw new InventoryError('Không thể cập nhật thanh toán ở trạng thái hiện tại.', 409);
      }
      if (outcome === 'failed') {
        if (order.paymentMethod === 'cod') throw new InventoryError('Đơn COD chưa thể đánh dấu thanh toán thất bại.', 409);
        await restoreInventory(order, session);
        order.status = 'failed';
        order.statusHistory.push({ status: 'failed', changedAt: now, actor });
      }
      order.paymentStatus = outcome;
      order.paymentHistory.push({ status: outcome, changedAt: now, actor });
      await order.save({ session });
      result = { order: order.toObject(), unchanged: false };
    });
  } finally {
    await session.endSession();
  }
  return result;
}

module.exports = {
  placeOrder,
  placeMongoOrder,
  getCustomerOrderById,
  getCustomerOrderByAccessToken,
  cancelMongoOrder,
  transitionMongoOrder,
  verifyMongoPayment,
  expirePendingMongoOrders
};

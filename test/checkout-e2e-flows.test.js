const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { connectMongo } = require('../server/lib/mongo');
const config = require('../server/config');
const Customer = require('../server/models/customer');
const Order = require('../server/models/order');
const Product = require('../server/models/product');
const purchaseService = require('../server/services/purchase-service');
const accountService = require('../server/services/account-service');
const { get_eligible_guest_customers } = require('../server/services/guest-eligibility-service');
const { createOrderContext } = require('../server/lib/order-security');

let mongoConnected = false;
const createdOrderIds = [];
const createdUserIds = [];

test.before(async () => {
  const uri = config.mongoDbUri || config.databaseUrl;
  if (uri) {
    try {
      await connectMongo(uri);
      mongoConnected = true;
    } catch (e) {
      console.warn('Mongo connection for E2E test failed:', e.message);
    }
  }
});

test.after(async () => {
  if (mongoConnected) {
    // Clean up only the specific test orders and test customers created by this test suite
    if (createdOrderIds.length > 0) {
      await Order.deleteMany({ id: { $in: createdOrderIds } });
    }
    if (createdUserIds.length > 0) {
      await Customer.deleteMany({ _id: { $in: createdUserIds } });
    }
    await mongoose.disconnect();
  }
});

test('LUỒNG 1 (Guest Checkout): Khách vãng lai đặt hàng, tạo VietQR, trừ tồn kho và đồng bộ Admin', async () => {
  if (!mongoConnected) return;

  // 1. Pick a published product with variant
  const product = await Product.findOne({ productStatus: 'PUBLISHED', 'variants.0': { $exists: true } });
  assert.ok(product, 'Must have at least one published product with variants');
  const variant = product.variants.find(v => v.stock >= 2);
  assert.ok(variant, 'Must have a variant with at least 2 units in stock');

  const initialVariantStock = variant.stock;
  const initialTotalStock = product.stock;
  const orderQty = 1;

  // 2. Prepare Guest Cart & Order Context
  const cartItems = [{
    id: String(product._id),
    variantId: String(variant._id),
    qty: orderQty
  }];

  const customer = {
    customerName: 'Nguyễn Văn Khách Test',
    phone: '0987654321',
    address: '123 Phố Huế, Hai Bà Trưng, Hà Nội',
    notes: 'Giao giờ hành chính'
  };

  const rawKey = `guest-e2e-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const ownerIdentity = `guest:session-${Date.now()}`;
  const orderContext = createOrderContext({
    rawKey,
    ownerIdentity,
    customerId: '',
    cartItems,
    customer,
    discountRate: 0,
    paymentMethod: 'bank_transfer'
  });

  // 3. Place Order as Guest
  const order = await purchaseService.placeOrder({
    cartItems,
    customer,
    user: null,
    discountRate: 0,
    paymentMethod: 'bank_transfer',
    orderContext
  });

  assert.ok(order, 'Guest order must be created');
  assert.ok(order.id.startsWith('HD-'), `Order ID must have HD- prefix: ${order.id}`);
  createdOrderIds.push(order.id);

  // 4. Verify VietQR & Payment Fields
  assert.equal(order.paymentMethod, 'bank_transfer');
  assert.equal(order.paymentStatus, 'pending');
  assert.ok(order.payment.transferNote.includes(order.id), 'Transfer note must contain order reference');
  assert.ok(order.paymentQrUrl.includes('https://img.vietqr.io/image/'), 'VietQR image URL must be generated');

  // 5. Verify Inventory Deduction
  const reloadedProduct = await Product.findById(product._id);
  const reloadedVariant = reloadedProduct.variants.id(variant._id);
  assert.equal(reloadedVariant.stock, initialVariantStock - orderQty, 'Variant stock must be decremented by order quantity');
  assert.equal(reloadedProduct.stock, initialTotalStock - orderQty, 'Total product stock must be decremented');

  // Restore inventory for clean test state
  await Product.updateOne(
    { _id: product._id, 'variants._id': variant._id },
    {
      $inc: { 'variants.$.stock': orderQty, stock: orderQty },
      $set: { updatedAt: new Date() }
    }
  );

  // 6. Verify Admin Synchronization: Guest customer listed in /api/admin/customers
  const customersResult = await accountService.listCustomers({ query: '0987654321' });
  assert.ok(customersResult.items.length > 0, 'Guest customer must be found by phone number');
  const guestEntry = customersResult.items.find(c => c.phone === '0987654321');
  assert.ok(guestEntry, 'Guest customer entry must exist in CRM');
  assert.equal(guestEntry.customerType, 'GUEST', 'Customer type must be GUEST');
  assert.equal(guestEntry.isGuest, true, 'isGuest must be true');
  assert.ok(guestEntry.orderCount >= 1, 'Guest order count must be >= 1');
});

test('LUỒNG 2 (Registered User Checkout): Thành viên đăng nhập, áp mã ưu đãi 15%, ghi nhận userId và doanh thu', async () => {
  if (!mongoConnected) return;

  // 1. Register a new customer
  const username = `member_test_${Date.now()}`;
  const phone = `091${Math.floor(1000000 + Math.random() * 9000000)}`;
  const regResult = await accountService.registerUser({
    username,
    password: 'Password@2026Member!',
    fullName: 'Hoàng Thị Thành Viên',
    phone,
    address: '456 Lê Lợi, Quận 1, TP. Hồ Chí Minh'
  });

  assert.equal(regResult.ok, true, 'User registration must succeed');
  const registeredUser = regResult.user;
  registeredUser.address = '456 Lê Lợi, Quận 1, TP. Hồ Chí Minh';
  assert.ok(registeredUser, 'Member must be registered');
  createdUserIds.push(registeredUser.id);

  // 2. Member Cart & Order Context with 15% discount
  const product = await Product.findOne({ productStatus: 'PUBLISHED', 'variants.0': { $exists: true } });
  const variant = product.variants[0];
  const orderQty = 1;

  const cartItems = [{
    id: String(product._id),
    variantId: String(variant._id),
    qty: orderQty
  }];

  const customer = {
    customerName: registeredUser.fullName,
    phone: registeredUser.phone,
    address: registeredUser.address,
    notes: 'Khách hàng VIP'
  };

  const rawKey = `member-e2e-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const ownerIdentity = `user:${registeredUser.id}`;
  const memberDiscountRate = 0.15;

  const orderContext = createOrderContext({
    rawKey,
    ownerIdentity,
    customerId: registeredUser.id,
    cartItems,
    customer,
    discountRate: memberDiscountRate,
    paymentMethod: 'bank_transfer'
  });

  // 3. Place Order as Member
  const order = await purchaseService.placeOrder({
    cartItems,
    customer,
    user: registeredUser,
    discountRate: memberDiscountRate,
    paymentMethod: 'bank_transfer',
    orderContext
  });

  assert.ok(order, 'Member order must be created');
  createdOrderIds.push(order.id);

  // 4. Verify Member Specific Order Fields
  assert.equal(order.customerId, registeredUser.id, 'Order must attach customerId of registered user');
  assert.equal(order.pricing.discountRate, 0.15, '15% discount rate must be applied');
  assert.ok(order.pricing.discountAmount > 0, 'Discount amount must be greater than 0');
  const expectedTotal = Math.round(order.pricing.subtotal * (1 - memberDiscountRate));
  assert.equal(order.totalAmount, expectedTotal, 'Total amount must match discounted price');

  // Restore inventory
  await Product.updateOne(
    { _id: product._id, 'variants._id': variant._id },
    {
      $inc: { 'variants.$.stock': orderQty, stock: orderQty },
      $set: { updatedAt: new Date() }
    }
  );

  // 5. Admin confirms payment
  const updatedOrder = await Order.findOneAndUpdate(
    { id: order.id },
    {
      $set: {
        paymentStatus: 'paid',
        status: 'confirmed'
      },
      $push: {
        paymentHistory: { status: 'paid', changedAt: new Date(), actor: 'admin' },
        statusHistory: { status: 'confirmed', changedAt: new Date(), actor: 'admin' }
      }
    },
    { new: true }
  );
  assert.equal(updatedOrder.paymentStatus, 'paid');

  // 6. Verify CRM & Export Center segmentation
  const customersResult = await accountService.listCustomers({ query: registeredUser.username });
  assert.ok(customersResult.items.length > 0, 'Registered member must be found in CRM');
  const memberEntry = customersResult.items.find(c => c.username === registeredUser.username);
  assert.equal(memberEntry.customerType, 'REGISTERED', 'Customer type must be REGISTERED');
  assert.equal(memberEntry.isGuest, false, 'isGuest must be false');

  // 7. Verify Registered Member is EXCLUDED from Guest Export Archive
  const { eligible, summary } = await get_eligible_guest_customers();
  const guestPhones = eligible.map(g => g.phone);
  assert.equal(guestPhones.includes(registeredUser.phone), false, 'Registered member phone must be excluded from guest export list');
  assert.ok(summary.totalRegisteredCustomers >= 1, 'Total registered customers count must be >= 1');
});

test('EDGE CASES: Chống double-submit, chặn giỏ hàng rỗng và vượt tồn kho', async () => {
  if (!mongoConnected) return;

  const product = await Product.findOne({ productStatus: 'PUBLISHED', 'variants.0': { $exists: true } });
  const variant = product.variants[0];

  const customer = {
    customerName: 'Edge Case Tester',
    phone: '0901234567',
    address: '789 Đường Láng, Đống Đa, Hà Nội',
    notes: 'Test edge cases'
  };

  // Case A: Double-submit prevention with identical idempotencyKey
  const rawKey = `idempotency-test-${Date.now()}`;
  const ownerIdentity = `guest:session-idempotency`;
  const cartItems = [{
    id: String(product._id),
    variantId: String(variant._id),
    qty: 1
  }];

  const orderContext = createOrderContext({
    rawKey,
    ownerIdentity,
    customerId: '',
    cartItems,
    customer,
    discountRate: 0,
    paymentMethod: 'bank_transfer'
  });

  const firstSubmission = await purchaseService.placeOrder({
    cartItems,
    customer,
    user: null,
    discountRate: 0,
    paymentMethod: 'bank_transfer',
    orderContext
  });
  createdOrderIds.push(firstSubmission.id);

  // Restore inventory from first order
  await Product.updateOne(
    { _id: product._id, 'variants._id': variant._id },
    { $inc: { 'variants.$.stock': 1, stock: 1 } }
  );

  const initialStockBeforeSecondSubmit = (await Product.findById(product._id)).variants.id(variant._id).stock;

  // Re-submit identical request
  const secondSubmission = await purchaseService.placeOrder({
    cartItems,
    customer,
    user: null,
    discountRate: 0,
    paymentMethod: 'bank_transfer',
    orderContext
  });

  assert.equal(secondSubmission.id, firstSubmission.id, 'Idempotent re-submission must return existing order ID');
  const stockAfterSecondSubmit = (await Product.findById(product._id)).variants.id(variant._id).stock;
  assert.equal(stockAfterSecondSubmit, initialStockBeforeSecondSubmit, 'Idempotent re-submission must NOT deduct stock twice');

  // Case B: Excess inventory request is rejected
  const excessiveCart = [{
    id: String(product._id),
    variantId: String(variant._id),
    qty: 999999 // Exceeds any possible stock
  }];

  const excessOrderContext = createOrderContext({
    rawKey: `excess-stock-${Date.now()}`,
    ownerIdentity: `guest:excess`,
    customerId: '',
    cartItems: excessiveCart,
    customer,
    discountRate: 0,
    paymentMethod: 'bank_transfer'
  });

  await assert.rejects(
    async () => {
      await purchaseService.placeOrder({
        cartItems: excessiveCart,
        customer,
        user: null,
        discountRate: 0,
        paymentMethod: 'bank_transfer',
        orderContext: excessOrderContext
      });
    },
    /Không đủ tồn kho/,
    'Ordering more than available stock must be rejected with InventoryError'
  );

  // Case C: Empty cart is rejected
  await assert.rejects(
    async () => {
      await purchaseService.placeOrder({
        cartItems: [],
        customer,
        user: null,
        discountRate: 0,
        paymentMethod: 'bank_transfer',
        orderContext
      });
    },
    /Giỏ hàng đang trống/,
    'Empty cart must be rejected'
  );
});

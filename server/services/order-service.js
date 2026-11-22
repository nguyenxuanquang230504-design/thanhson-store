const { ordersFile, payment, bankTransferExpiryHours } = require('../config');
const { readJson, writeJson } = require('../lib/json-store');
const crypto = require('crypto');

function buildPaymentQrUrl(order) {
  const bankId = order.payment?.bankId || payment.bankId;
  const accountNo = order.payment?.accountNo || payment.accountNo;
  const accountName = order.payment?.accountName || payment.accountName;
  const transferNote = order.payment?.transferNote || `${order.id} ${order.customer.phone}`;
  return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${order.totalAmount}&addInfo=${encodeURIComponent(transferNote)}&accountName=${encodeURIComponent(accountName)}`;
}

function createOrder({
  summary,
  customer,
  user,
  discountRate,
  idempotencyKey = '',
  idempotencyFingerprint = '',
  ownerKeyHash = '',
  customerId = '',
  guestAccessTokenHash = '',
  paymentMethod = 'bank_transfer'
}) {
  const subtotal = summary.totalAmount;
  const discountAmount = Math.round(subtotal * discountRate);
  const totalAmount = subtotal - discountAmount;
  const id = `HD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const createdAt = new Date();
  const method = paymentMethod === 'cod' ? 'cod' : 'bank_transfer';
  const order = {
    id,
    createdAt: createdAt.toISOString(),
    status: 'pending',
    idempotencyKey,
    idempotencyFingerprint,
    ownerKeyHash,
    customerId,
    guestAccessTokenHash,
    statusHistory: [{ status: 'pending', changedAt: createdAt.toISOString(), actor: 'system' }],
    paymentMethod: method,
    paymentStatus: method === 'cod' ? 'unpaid' : 'pending',
    paymentExpiresAt: method === 'bank_transfer'
      ? new Date(createdAt.getTime() + bankTransferExpiryHours * 60 * 60 * 1000).toISOString()
      : null,
    paymentHistory: [{ status: method === 'cod' ? 'unpaid' : 'pending', changedAt: createdAt.toISOString(), actor: 'system' }],
    inventoryDeductedAt: createdAt.toISOString(),
    customer,
    user: user || null,
    pricing: { subtotal, discountRate, discountAmount, shippingFee: 0, totalAmount },
    items: summary.items.map(item => ({
      id: item.id,
      productId: item.id,
      variantId: item.variantId || null,
      sku: item.variant?.sku || item.product.sku || '',
      size: item.variant?.size || '',
      color: item.variant?.color || '',
      name: item.product.name,
      image: item.product.image,
      qty: item.qty,
      price: Number(item.price ?? item.product.price),
      subtotal: item.subtotal
    })),
    totalAmount,
    payment: method === 'bank_transfer'
      ? {
          bankId: payment.bankId,
          accountNo: payment.accountNo,
          accountName: payment.accountName,
          transferNote: ''
        }
      : { bankId: '', accountNo: '', accountName: '', transferNote: '' }
  };

  if (method === 'bank_transfer') {
    order.payment.transferNote = `${order.id} ${customer.phone}`;
    order.paymentQrUrl = buildPaymentQrUrl(order);
  }
  return order;
}

function saveOrder(order) {
  const orders = readJson(ordersFile, []);
  if (order.idempotencyKey) {
    const existing = orders.find(item => item.idempotencyKey === order.idempotencyKey);
    if (existing) return existing;
  }
  orders.push(order);
  writeJson(ordersFile, orders);
  return order;
}

function findByIdempotencyKey(idempotencyKey) {
  if (!idempotencyKey) return null;
  const orders = readJson(ordersFile, []);
  return orders.find(order => order.idempotencyKey === idempotencyKey) || null;
}

function getLatestOrder() {
  const orders = readJson(ordersFile, []);
  return orders[orders.length - 1] || null;
}

function getOrderById(id) {
  if (!id) return null;
  return readJson(ordersFile, []).find(order => order.id === id) || null;
}

function getByAccessTokenHash(tokenHash) {
  if (!tokenHash) return null;
  return readJson(ordersFile, []).find(order => order.guestAccessTokenHash === tokenHash) || null;
}

module.exports = { createOrder, saveOrder, getLatestOrder, getOrderById, getByAccessTokenHash, findByIdempotencyKey, buildPaymentQrUrl };

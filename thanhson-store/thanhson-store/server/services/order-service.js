const { ordersFile, payment } = require('../config');
const { readJson, writeJson } = require('../lib/json-store');

function buildPaymentQrUrl(order) {
  const transferNote = `${order.id} ${order.customer.phone}`;
  return `https://img.vietqr.io/image/${payment.bankId}-${payment.accountNo}-compact2.png?amount=${order.totalAmount}&addInfo=${encodeURIComponent(transferNote)}&accountName=${encodeURIComponent(payment.accountName)}`;
}

function createOrder({ summary, customer, user, discountRate }) {
  const subtotal = summary.totalAmount;
  const discountAmount = Math.round(subtotal * discountRate);
  const totalAmount = subtotal - discountAmount;
  const order = {
    id: 'HD-' + Date.now(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    customer,
    user: user || null,
    pricing: { subtotal, discountRate, discountAmount, totalAmount },
    items: summary.items.map(item => ({
      id: item.id,
      name: item.product.name,
      image: item.product.image,
      qty: item.qty,
      price: item.product.price,
      subtotal: item.subtotal
    })),
    totalAmount,
    payment: {
      bankId: payment.bankId,
      accountNo: payment.accountNo,
      accountName: payment.accountName,
      transferNote: ''
    }
  };

  order.payment.transferNote = `${order.id} ${customer.phone}`;
  order.paymentQrUrl = buildPaymentQrUrl(order);
  return order;
}

function saveOrder(order) {
  const orders = readJson(ordersFile, []);
  orders.push(order);
  writeJson(ordersFile, orders);
}

function getLatestOrder() {
  const orders = readJson(ordersFile, []);
  return orders[orders.length - 1] || null;
}

module.exports = { createOrder, saveOrder, getLatestOrder };

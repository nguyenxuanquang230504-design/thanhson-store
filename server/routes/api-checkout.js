const express = require('express');
const { memberDiscountRate } = require('../config');
const { getCart } = require('../services/cart-service');
const purchaseService = require('../services/purchase-service');
const InventoryError = require('../lib/inventory-error');
const { asyncRoute } = require('../middleware/admin-auth');
const crypto = require('crypto');
const { createOrderContext, hashAccessToken } = require('../lib/order-security');

const router = express.Router();

router.post('/', asyncRoute(async (req, res) => {
  const customer = {
    customerName: String(req.body.customerName || '').trim().slice(0, 120),
    phone: String(req.body.phone || '').trim().slice(0, 30),
    address: String(req.body.address || '').trim().slice(0, 500),
    notes: String(req.body.notes || '').trim().slice(0, 1000)
  };
  if (!customer.customerName || !customer.phone || !customer.address) {
    return res.status(400).json({ ok: false, message: 'Vui lòng điền đầy đủ thông tin người nhận.' });
  }
  if (!/^(0|\+84)[0-9]{9,10}$/.test(customer.phone.replace(/\s/g, ''))) {
    return res.status(400).json({ ok: false, message: 'Số điện thoại Việt Nam không hợp lệ.' });
  }
  const cartItems = getCart(req);
  if (!cartItems.length) throw new InventoryError('Giỏ hàng đang trống.', 400);
  const paymentMethod = String(req.body.paymentMethod || 'bank_transfer');
  if (!['bank_transfer', 'cod'].includes(paymentMethod)) {
    throw new InventoryError('Phương thức thanh toán không hợp lệ.', 400);
  }
  const user = req.session.user || null;
  const customerId = user ? String(user.id || user._id || user.username || '') : '';
  if (user && !customerId) throw new InventoryError('Không thể xác định tài khoản khách hàng.', 401);
  const rawIdempotencyKey = String(req.get('Idempotency-Key') || '').trim();
  if (!rawIdempotencyKey || rawIdempotencyKey.length > 100) {
    throw new InventoryError('Yêu cầu đặt hàng không hợp lệ. Vui lòng tải lại trang thanh toán.', 400);
  }
  const ownerIdentity = user
    ? `user:${customerId}`
    : `guest:${req.sessionID}`;
  const orderContext = createOrderContext({
    rawKey: rawIdempotencyKey,
    ownerIdentity,
    customerId,
    cartItems,
    customer,
    discountRate: user ? memberDiscountRate : 0,
    paymentMethod
  });
  let guestAccessToken = '';
  if (!user) {
    const tokens = req.session.orderAccessTokens || {};
    guestAccessToken = tokens[orderContext.idempotencyKey] || crypto.randomBytes(32).toString('base64url');
    const updatedTokens = { ...tokens, [orderContext.idempotencyKey]: guestAccessToken };
    const tokenKeys = Object.keys(updatedTokens);
    if (tokenKeys.length > 10) delete updatedTokens[tokenKeys[0]];
    req.session.orderAccessTokens = updatedTokens;
    orderContext.guestAccessTokenHash = hashAccessToken(guestAccessToken);
  }

  const order = await purchaseService.placeOrder({
    cartItems,
    customer,
    user,
    discountRate: user ? memberDiscountRate : 0,
    paymentMethod,
    orderContext
  });
  req.session.cart = [];
  req.session.lastOrderId = order.id;
  if (guestAccessToken) {
    res.cookie('tsf-order-access', guestAccessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 30,
      path: '/don-hang'
    });
  }
  res.json({ ok: true, message: 'Đặt hàng thành công.', order: { reference: order.id } });
}));

module.exports = router;

const express = require('express');
const { memberDiscountRate } = require('../config');
const { getCartSummary } = require('../services/cart-service');
const orderService = require('../services/order-service');

const router = express.Router();

router.post('/', (req, res) => {
  const customerName = String(req.body.customerName || '').trim();
  const phone = String(req.body.phone || '').trim();
  const address = String(req.body.address || '').trim();
  const notes = String(req.body.notes || '').trim();
  if (!customerName || !phone || !address) {
    return res.status(400).json({ ok: false, message: 'Vui lòng điền đầy đủ thông tin người nhận.' });
  }

  const summary = getCartSummary(req);
  if (!summary.items.length) return res.status(400).json({ ok: false, message: 'Giỏ hàng đang trống.' });

  const order = orderService.createOrder({
    summary,
    customer: { customerName, phone, address, notes },
    user: req.session.user || null,
    discountRate: req.session.user ? memberDiscountRate : 0
  });
  orderService.saveOrder(order);
  req.session.cart = [];

  return res.json({ ok: true, message: 'Đặt hàng thành công. Đã lưu hóa đơn vào orders.json.', order });
});

module.exports = router;

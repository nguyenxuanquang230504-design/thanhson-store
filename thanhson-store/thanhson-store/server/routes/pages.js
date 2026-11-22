const express = require('express');
const productRepository = require('../../data/product-repository');
const { memberDiscountRate } = require('../config');
const { getCartSummary, getWishlist } = require('../services/cart-service');
const orderService = require('../services/order-service');

const router = express.Router();

router.get('/', (req, res) => res.render('index', { products: productRepository.findAll().slice(0, 4) }));

router.get('/health', (req, res) => {
  res.json({ ok: true, app: 'Thanh Son Fashion', timestamp: new Date().toISOString(), products: productRepository.findAll().length });
});

router.get('/dang-nhap', (req, res) => res.render('login', { message: req.query.message || '', currentUser: req.session.user || null }));
router.get('/dang-ky', (req, res) => res.render('register', { message: req.query.message || '' }));

router.get('/tim-kiem', (req, res) => {
  const query = String(req.query.q || '').trim();
  const category = String(req.query.category || '').trim();
  res.render('products', { products: productRepository.search({ query, category }), category, query, searchMode: true });
});

router.get('/san-pham', (req, res) => {
  const category = String(req.query.category || '').trim();
  res.render('products', { products: productRepository.findAll({ category }), category, query: '', searchMode: false });
});

router.get('/san-pham/:id', (req, res) => {
  const product = productRepository.findById(req.params.id);
  if (!product) return res.status(404).send('Sản phẩm không tồn tại');
  res.render('product-detail', { product });
});

router.get('/gio-hang', (req, res) => {
  const { items, totalAmount } = getCartSummary(req);
  res.render('cart', { items, total: totalAmount });
});

router.get('/yeu-thich', (req, res) => {
  const items = getWishlist(req).map(id => productRepository.findById(id)).filter(Boolean);
  res.render('wish-list', { items });
});

router.get('/thanh-toan', (req, res) => {
  const summary = getCartSummary(req);
  if (!summary.items.length) return res.redirect('/gio-hang');
  res.render('checkout', { cart: summary, user: req.session.user || null, discountRate: req.session.user ? memberDiscountRate : 0 });
});

router.get('/don-hang', (req, res) => {
  const order = orderService.getLatestOrder();
  if (!order) return res.redirect('/gio-hang');
  res.render('order-detail', { order });
});

module.exports = router;

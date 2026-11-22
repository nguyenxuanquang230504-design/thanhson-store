const express = require('express');
const productRepository = require('../../data/product-repository');
const { getCart, getCartSummary } = require('../services/cart-service');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(getCartSummary(req));
});

router.post('/add', (req, res) => {
  const { id, qty = 1 } = req.body;
  if (!productRepository.findById(id)) return res.status(404).json({ error: 'Product not found' });

  if (!req.session.cart) req.session.cart = [];
  const found = req.session.cart.find(item => item.id === id);
  const nextQty = Math.max(1, Number(qty) || 1);
  if (found) found.qty += nextQty;
  else req.session.cart.push({ id, qty: nextQty });
  return res.json({ ok: true });
});

router.post('/update', (req, res) => {
  const { id, qty } = req.body;
  const cart = getCart(req);
  const found = cart.find(item => item.id === id);
  if (!found) return res.status(404).json({ error: 'Not in cart' });

  const nextQty = Number(qty) || 1;
  if (nextQty <= 0) req.session.cart = cart.filter(item => item.id !== id);
  else found.qty = Math.max(1, nextQty);
  return res.json({ ok: true });
});

router.post('/remove', (req, res) => {
  req.session.cart = getCart(req).filter(item => item.id !== req.body.id);
  return res.json({ ok: true });
});

module.exports = router;

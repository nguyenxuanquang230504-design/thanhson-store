const express = require('express');
const productRepository = require('../../data/product-repository');
const { getWishlist } = require('../services/cart-service');

const router = express.Router();

router.get('/', (req, res) => {
  const ids = getWishlist(req);
  const items = ids.map(id => productRepository.findById(id)).filter(Boolean);
  res.json({ ids, items, total: items.length });
});

router.post('/toggle', (req, res) => {
  const { id } = req.body;
  if (!productRepository.findById(id)) return res.status(404).json({ error: 'Product not found' });

  if (!req.session.wishlist) req.session.wishlist = [];
  const index = req.session.wishlist.indexOf(id);
  if (index >= 0) req.session.wishlist.splice(index, 1);
  else req.session.wishlist.push(id);
  res.json({ ok: true, ids: req.session.wishlist });
});

module.exports = router;

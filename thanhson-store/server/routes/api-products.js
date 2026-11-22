const express = require('express');
const catalogService = require('../services/catalog-service');
const { asyncRoute } = require('../middleware/admin-auth');

const router = express.Router();

router.get('/', asyncRoute(async (req, res) => {
  const { q = '', category = '', limit } = req.query;
  const result = await catalogService.listProducts({ query: q, category, perPage: limit || 48 });
  res.json(result.products);
}));

router.get('/price-range', asyncRoute(async (req, res) => {
  const bounds = await catalogService.getPriceBounds({
    category: String(req.query.category || '').trim()
  });
  res.json({ ok: true, ...bounds });
}));

router.get('/:id', asyncRoute(async (req, res) => {
  const product = await catalogService.findProduct(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
}));

module.exports = router;

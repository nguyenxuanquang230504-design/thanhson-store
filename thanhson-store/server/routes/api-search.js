const express = require('express');
const catalogService = require('../services/catalog-service');
const { asyncRoute } = require('../middleware/admin-auth');

const router = express.Router();

router.get('/suggestions', asyncRoute(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const items = await catalogService.getSuggestions(q, 7);
  res.json({ ok: true, items });
}));

router.get('/products', asyncRoute(async (req, res) => {
  const result = await catalogService.listProducts({
    query: String(req.query.q || '').trim(),
    category: String(req.query.category || '').trim(),
    sort: String(req.query.sort || 'newest'),
    minPrice: String(req.query.minPrice || ''),
    maxPrice: String(req.query.maxPrice || ''),
    size: String(req.query.size || ''),
    color: String(req.query.color || ''),
    material: String(req.query.material || ''),
    brand: String(req.query.brand || ''),
    availableOnly: String(req.query.availableOnly || ''),
    page: String(req.query.page || '1'),
    perPage: String(req.query.perPage || '12')
  });
  res.json({ ok: true, ...result });
}));

module.exports = router;

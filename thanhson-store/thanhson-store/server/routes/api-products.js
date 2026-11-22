const express = require('express');
const productRepository = require('../../data/product-repository');

const router = express.Router();

router.get('/', (req, res) => {
  const { q = '', category = '', limit } = req.query;
  res.json(productRepository.search({ query: q, category, limit }));
});

router.get('/:id', (req, res) => {
  const product = productRepository.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

module.exports = router;

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const productRepository = require('../data/product-repository');

test('product repository finds a real product', () => {
  const product = productRepository.findById('tsf-001');
  assert.equal(product.name, 'Áo dài hồng');
  assert.ok(product.price > 0);
  assert.ok(product.stock > 0);
});

test('product repository filters by category', () => {
  const products = productRepository.findAll({ category: 'man' });
  assert.equal(products.length, 2);
  assert.ok(products.every(product => product.category === 'man'));
});

test('product search matches Vietnamese text with or without accents', () => {
  const accented = productRepository.list({ query: 'Áo dài hồng' });
  const unaccented = productRepository.list({ query: 'ao dai hong' });
  assert.ok(accented.products.some(product => product.id === 'tsf-001'));
  assert.ok(unaccented.products.some(product => product.id === 'tsf-001'));
});

test('initial migration exists and includes core tables', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_initial.sql'), 'utf8');
  for (const table of ['customers', 'products', 'product_variants', 'orders', 'order_items', 'inventory_transactions']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

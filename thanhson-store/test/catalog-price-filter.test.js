const test = require('node:test');
const assert = require('node:assert/strict');
const { makeMongoFilter, priceStep, sellingPrice } = require('../server/services/catalog-service');

test('Mongo price filters use numeric customer-facing sale prices and retain category constraints', () => {
  const filter = makeMongoFilter({
    category: 'woman',
    minPrice: '100000',
    maxPrice: '500000',
    size: 'M'
  });
  const priceClause = filter.$and.find(clause => clause.$or?.some(branch => branch.salePrice));
  assert.ok(priceClause);
  assert.deepEqual(priceClause.$or[0].salePrice, { $ne: null, $gte: 100000, $lte: 500000 });
  assert.deepEqual(priceClause.$or[1], { salePrice: null, price: { $gte: 100000, $lte: 500000 } });
  assert.ok(filter.$and.some(clause => clause.$or?.some(branch => branch.categorySlug === 'woman')));
  assert.ok(filter.$and.some(clause => clause.$or?.some(branch => branch.sizes === 'M')));
  assert.equal(filter.productStatus, 'PUBLISHED');
});

test('price boundaries and customer-facing price calculations remain numeric', () => {
  assert.equal(sellingPrice({ price: 520000, salePrice: 390000 }), 390000);
  assert.equal(sellingPrice({ price: 520000, salePrice: null }), 520000);
  assert.ok(priceStep(700000) > 0);
  assert.ok(priceStep(7000000) > priceStep(700000));
});

test('size and color constraints must match the same inventory variant', () => {
  const filter = makeMongoFilter({ size: 'M', color: 'Đỏ' });
  const variantClause = filter.$and.find(clause =>
    clause.$or?.some(branch => branch.variants?.$elemMatch)
  );
  assert.deepEqual(variantClause.$or[0], {
    variants: { $elemMatch: { size: 'M', color: 'Đỏ' } }
  });
});

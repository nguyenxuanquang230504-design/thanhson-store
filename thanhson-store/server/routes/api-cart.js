const express = require('express');
const catalogService = require('../services/catalog-service');
const { getCart, getCartSummary } = require('../services/cart-service');
const { asyncRoute } = require('../middleware/admin-auth');

const router = express.Router();

function findVariant(product, variantId) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  return variants.find(variant => String(variant._id) === String(variantId)) || null;
}

function lineStock(product, variant) {
  return variant ? Number(variant.stock || 0) : Number(product.stock || 0);
}

router.get('/', asyncRoute(async (req, res) => {
  res.json(await getCartSummary(req));
}));

router.post('/add', asyncRoute(async (req, res) => {
  const id = String(req.body.id || '');
  const requestedQty = Number(req.body.qty ?? 1);
  if (!Number.isSafeInteger(requestedQty) || requestedQty < 1) {
    return res.status(400).json({ ok: false, message: 'Số lượng phải là số nguyên lớn hơn 0.' });
  }
  const product = await catalogService.findProduct(id);
  if (!product) return res.status(404).json({ ok: false, message: 'Không tìm thấy sản phẩm đang bán.' });
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const variantId = String(req.body.variantId || '');
  if (variants.length && !variantId) return res.status(400).json({ ok: false, message: 'Vui lòng chọn phân loại sản phẩm.' });
  if (!variants.length && variantId) return res.status(400).json({ ok: false, message: 'Sản phẩm không có phân loại được chọn.' });
  const variant = variantId ? findVariant(product, variantId) : null;
  if (variantId && !variant) return res.status(400).json({ ok: false, message: 'Phân loại sản phẩm không hợp lệ.' });
  const availableStock = lineStock(product, variant);
  if ((variant && variant.available === false) || availableStock <= 0) {
    return res.status(409).json({ ok: false, message: 'Sản phẩm đã hết hàng.' });
  }

  const cart = getCart(req);
  const found = cart.find(item => item.id === id && String(item.variantId || '') === variantId);
  const nextQty = Number(found?.qty || 0) + requestedQty;
  if (nextQty > availableStock) {
    return res.status(409).json({ ok: false, message: `Chỉ còn ${availableStock} sản phẩm có thể chọn.` });
  }
  if (found) found.qty = nextQty;
  else cart.push({ id, ...(variantId ? { variantId } : {}), qty: requestedQty });
  req.session.cart = cart;
  res.json({ ok: true, totalQty: cart.reduce((total, item) => total + item.qty, 0) });
}));

router.post('/update', asyncRoute(async (req, res) => {
  const id = String(req.body.id || '');
  const variantId = String(req.body.variantId || '');
  const parsedQty = Number(req.body.qty);
  if (!Number.isSafeInteger(parsedQty) || parsedQty < 0) {
    return res.status(400).json({ ok: false, message: 'Số lượng phải là số nguyên không âm.' });
  }
  const cart = getCart(req);
  const found = cart.find(item => item.id === id && String(item.variantId || '') === variantId);
  if (!found) return res.status(404).json({ ok: false, message: 'Sản phẩm không còn trong giỏ.' });
  if (parsedQty === 0) {
    req.session.cart = cart.filter(item => item !== found);
    return res.json({ ok: true });
  }
  const product = await catalogService.findProduct(id);
  if (!product) return res.status(404).json({ ok: false, message: 'Sản phẩm không còn được bán.' });
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const variant = variantId ? findVariant(product, variantId) : null;
  if ((variants.length && !variant) || (!variants.length && variantId)) {
    return res.status(409).json({ ok: false, message: 'Phân loại đã thay đổi. Vui lòng chọn lại.' });
  }
  const availableStock = lineStock(product, variant);
  if ((variant && variant.available === false) || parsedQty > availableStock) {
    return res.status(409).json({ ok: false, message: `Chỉ còn ${availableStock} sản phẩm có thể chọn.` });
  }
  found.qty = parsedQty;
  res.json({ ok: true });
}));

router.post('/remove', (req, res) => {
  const id = String(req.body.id || '');
  const variantId = String(req.body.variantId || '');
  req.session.cart = getCart(req).filter(item => {
    if (item.id !== id) return true;
    return variantId ? String(item.variantId || '') !== variantId : false;
  });
  res.json({ ok: true });
});

module.exports = router;

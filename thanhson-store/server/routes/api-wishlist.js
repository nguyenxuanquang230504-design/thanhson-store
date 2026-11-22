const express = require('express');
const catalogService = require('../services/catalog-service');
const accountService = require('../services/account-service');
const { getWishlist } = require('../services/cart-service');
const { asyncRoute } = require('../middleware/admin-auth');

const router = express.Router();

function saveWishlist(req, ids) {
  if (req.session.user) {
    if (!accountService.updateWishlist(req.session.user.username, ids)) return false;
    req.session.user.wishlist = ids;
  } else {
    req.session.wishlist = ids;
  }
  return true;
}

router.get('/', asyncRoute(async (req, res) => {
  const ids = getWishlist(req);
  const items = (await Promise.all(ids.map(id => catalogService.findProduct(id)))).filter(Boolean);
  res.json({ ids, items, total: items.length });
}));

router.post('/toggle', asyncRoute(async (req, res) => {
  const id = String(req.body.id || '');
  if (!await catalogService.findProduct(id)) {
    return res.status(404).json({ ok: false, message: 'Sản phẩm không còn được bán.' });
  }
  const ids = [...getWishlist(req)];
  const index = ids.indexOf(id);
  const added = index < 0;
  if (added) ids.push(id);
  else ids.splice(index, 1);
  if (!saveWishlist(req, ids)) return res.status(500).json({ ok: false, message: 'Không thể lưu danh sách yêu thích.' });
  res.json({ ok: true, added, ids });
}));

module.exports = router;

const express = require('express');
const accountService = require('../services/account-service');

const router = express.Router();

router.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  if (!username || !password) {
    return res.status(400).json({ ok: false, message: 'Vui lòng nhập tên đăng nhập và mật khẩu.' });
  }

  const result = accountService.authenticate(username, password);
  if (!result.ok) return res.status(result.status).json(result);
  const guestWishlist = Array.isArray(req.session.wishlist) ? req.session.wishlist : [];
  result.user.wishlist = [...new Set([...guestWishlist, ...result.user.wishlist])];
  if (!accountService.updateWishlist(username, result.user.wishlist)) {
    return res.status(500).json({ ok: false, message: 'Không thể lưu danh sách yêu thích.' });
  }
  req.session.user = result.user;
  req.session.wishlist = [];
  return res.json({ ok: true, message: 'Đăng nhập thành công. Bạn được giảm 15% trên đơn hàng.', user: result.user });
});

router.post('/register', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  const fullName = String(req.body.fullName || '').trim();
  const phone = String(req.body.phone || '').trim();
  if (!username || !password || !fullName || !phone) {
    return res.status(400).json({ ok: false, message: 'Vui lòng điền đầy đủ họ tên, số điện thoại, tên đăng nhập và mật khẩu.' });
  }
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
    return res.status(400).json({ ok: false, message: 'Tên đăng nhập từ 3-30 ký tự, chỉ dùng chữ, số, dấu . _ hoặc -.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ ok: false, message: 'Mật khẩu phải có ít nhất 8 ký tự.' });
  }

  const result = accountService.registerUser({ username, password, fullName, phone });
  if (!result.ok) return res.status(result.status).json(result);
  return res.json({ ok: true, message: 'Đăng ký thành công. Vui lòng đăng nhập để nhận ưu đãi giảm 15%.' });
});

router.post('/logout', (req, res) => {
  const wishlist = req.session.user?.wishlist || req.session.wishlist || [];
  req.session.user = null;
  req.session.wishlist = wishlist;
  req.session.save(error => {
    if (error) return res.status(500).json({ ok: false, message: 'Không thể đăng xuất.' });
    res.json({ ok: true, message: 'Đã đăng xuất.' });
  });
});

module.exports = router;

const express = require('express');
const accountService = require('../services/account-service');

const router = express.Router();

router.post('/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  if (!username || !password) {
    return res.status(400).json({ ok: false, message: 'Vui lòng nhập tên đăng nhập và mật khẩu.' });
  }

  try {
    const result = await accountService.authenticate(username, password);
    if (!result.ok) return res.status(result.status || 400).json(result);

    const guestWishlist = Array.isArray(req.session.wishlist) ? req.session.wishlist : [];
    result.user.wishlist = [...new Set([...guestWishlist, ...(result.user.wishlist || [])])];
    await accountService.updateWishlist(username, result.user.wishlist);

    req.session.user = result.user;
    req.session.wishlist = [];
    return res.json({ ok: true, message: 'Đăng nhập thành công. Bạn được giảm 15% trên đơn hàng.', user: result.user });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ ok: false, message: 'Lỗi máy chủ khi đăng nhập.' });
  }
});

router.post('/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  const fullName = String(req.body.fullName || '').trim();
  const phone = String(req.body.phone || '').trim().replace(/\s/g, '');
  const email = String(req.body.email || '').trim().toLowerCase();
  const address = String(req.body.address || '').trim();

  if (!username || !password || !fullName || !phone) {
    return res.status(400).json({ ok: false, message: 'Vui lòng điền đầy đủ họ tên, số điện thoại, tên đăng nhập và mật khẩu.' });
  }
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
    return res.status(400).json({ ok: false, message: 'Tên đăng nhập từ 3-30 ký tự, chỉ dùng chữ, số, dấu . _ hoặc -.' });
  }
  if (!/^(0|\+84)[0-9]{9,10}$/.test(phone)) {
    return res.status(400).json({ ok: false, message: 'Số điện thoại Việt Nam không hợp lệ.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ ok: false, message: 'Mật khẩu phải có ít nhất 8 ký tự.' });
  }

  try {
    const result = await accountService.registerUser({ username, password, fullName, phone, email, address });
    if (!result.ok) return res.status(result.status || 400).json(result);
    return res.json({ ok: true, message: 'Đăng ký thành công. Vui lòng đăng nhập để nhận ưu đãi giảm 15%.' });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ ok: false, message: 'Lỗi máy chủ khi đăng ký.' });
  }
});

router.post('/profile', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ ok: false, message: 'Vui lòng đăng nhập để cập nhật hồ sơ.' });
  }
  const customerId = req.session.user.id || req.session.user._id;
  const { fullName, phone, address, email } = req.body;

  if (phone && !/^(0|\+84)[0-9]{9,10}$/.test(String(phone).replace(/\s/g, ''))) {
    return res.status(400).json({ ok: false, message: 'Số điện thoại Việt Nam không hợp lệ.' });
  }

  try {
    const updated = await accountService.updateProfile(customerId, { fullName, phone, address, email });
    if (!updated) return res.status(404).json({ ok: false, message: 'Không tìm thấy thông tin tài khoản.' });

    req.session.user = {
      ...req.session.user,
      fullName: updated.fullName,
      phone: updated.phone,
      address: updated.address || '',
      email: updated.email || ''
    };
    return res.json({ ok: true, message: 'Cập nhật thông tin thành công.', user: req.session.user });
  } catch (error) {
    console.error('Profile update error:', error);
    return res.status(500).json({ ok: false, message: 'Không thể cập nhật hồ sơ.' });
  }
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

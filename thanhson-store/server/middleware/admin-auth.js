function requireAdmin(req, res, next) {
  const admin = req.session.admin;
  if (!admin) {
    if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ ok: false, message: 'Vui lòng đăng nhập quản trị.' });
    return res.redirect('/admin/login');
  }
  const isChangePassword = req.originalUrl.startsWith('/admin/change-password') || req.originalUrl.startsWith('/api/admin/change-password');
  if (admin.mustChangePassword && !isChangePassword) {
    if (req.originalUrl.startsWith('/api/')) return res.status(403).json({ ok: false, message: 'Hãy đổi mật khẩu trước khi tiếp tục.' });
    return res.redirect('/admin/change-password');
  }
  next();
}

function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.session.admin || !roles.includes(req.session.admin.role)) {
      return res.status(403).json({ ok: false, message: 'Bạn không có quyền thực hiện thao tác này.' });
    }
    next();
  };
}

function asyncRoute(handler) {
  return function handleAsync(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = { requireAdmin, requireRole, asyncRoute };

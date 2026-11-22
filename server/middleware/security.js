const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const windows = new Map();

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://img.vietqr.io data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'");
  next();
}

function requireSafeOrigin(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();
  if (!req.get('origin') && !req.get('referer')) return next();
  const allowedHost = req.get('host');
  const source = req.get('origin') || req.get('referer');
  try {
    if (new URL(source).host !== allowedHost) {
      return res.status(403).json({ ok: false, message: 'Yêu cầu không được phép.' });
    }
  } catch (_) {
    return res.status(403).json({ ok: false, message: 'Yêu cầu không hợp lệ.' });
  }
  next();
}

function rateLimit({ windowMs, max }) {
  return function limiter(req, res, next) {
    const now = Date.now();
    const key = req.ip;
    const state = windows.get(key);
    if (!state || now - state.startedAt >= windowMs) {
      windows.set(key, { startedAt: now, count: 1 });
      return next();
    }
    state.count += 1;
    if (state.count > max) {
      res.setHeader('Retry-After', Math.ceil((windowMs - (now - state.startedAt)) / 1000));
      return res.status(429).json({ ok: false, message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.' });
    }
    next();
  };
}

module.exports = { securityHeaders, requireSafeOrigin, rateLimit };

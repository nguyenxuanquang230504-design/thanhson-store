const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const config = require('./config');
const { ensureJsonFile } = require('./lib/json-store');
const { connectMongo, isMongoConnected } = require('./lib/mongo');
const viewLocals = require('./middleware/view-locals');
const { securityHeaders, requireSafeOrigin, rateLimit } = require('./middleware/security');

const app = express();

app.set('trust proxy', 1);

ensureJsonFile(config.usersFile, []);
ensureJsonFile(config.ordersFile, []);

if (config.nodeEnv === 'production' && !config.sessionSecret) {
  throw new Error('SESSION_SECRET is required in production');
}

// Serverless lazy MongoDB connection middleware
app.use(async (req, res, next) => {
  if (config.mongoDbUri && !isMongoConnected()) {
    try {
      await connectMongo(config.mongoDbUri);
    } catch (err) {
      console.error('Database connection error in request lifecycle:', err.message);
    }
  }
  next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: config.nodeEnv === 'production' ? 1000 * 60 * 10 : 0,
  etag: true,
  lastModified: true
}));
app.use(express.json({ limit: '7mb' }));
app.use(express.urlencoded({ extended: true }));
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(requireSafeOrigin);
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));
const sessionOptions = {
  secret: config.sessionSecret || 'development-only-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.nodeEnv === 'production', maxAge: 1000 * 60 * 60 * 24 * 7 }
};

if (config.mongoDbUri) {
  sessionOptions.store = MongoStore.create({
    mongoUrl: config.mongoDbUri,
    ttl: 7 * 24 * 60 * 60,
    touchAfter: 24 * 3600
  });
}

app.use(session(sessionOptions));
app.use(viewLocals);

app.use('/api/products', require('./routes/api-products'));
app.use('/api/search', require('./routes/api-search'));
app.use('/api/admin', require('./routes/api-admin'));
app.use('/admin', require('./routes/admin-pages'));
app.use('/api/cart', require('./routes/api-cart'));
app.use('/api/wishlist', require('./routes/api-wishlist'));
app.use('/api/auth', require('./routes/api-auth'));
app.use('/api/checkout', require('./routes/api-checkout'));
app.use('/', require('./routes/pages'));

app.use((error, req, res, next) => {
  const status = error.status || (error.code === 11000 ? 409 : 500);
  if (status >= 500) console.error('Request failed:', error);
  const message = error.code === 11000
    ? 'Giá trị này đã được sử dụng.'
    : status < 500 ? error.message : 'Đã xảy ra lỗi máy chủ.';
  if (req.path.startsWith('/api/')) return res.status(status).json({ ok: false, message });
  res.status(status).send(message);
});

module.exports = app;

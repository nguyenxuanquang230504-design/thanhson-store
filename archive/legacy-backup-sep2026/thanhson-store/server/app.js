const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('./config');
const { ensureJsonFile } = require('./lib/json-store');
const viewLocals = require('./middleware/view-locals');

const app = express();

ensureJsonFile(config.usersFile, []);
ensureJsonFile(config.ordersFile, []);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: 1000 * 60 * 10,
  etag: true,
  lastModified: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'tsf-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(viewLocals);

app.use('/api/products', require('./routes/api-products'));
app.use('/api/cart', require('./routes/api-cart'));
app.use('/api/wishlist', require('./routes/api-wishlist'));
app.use('/api/auth', require('./routes/api-auth'));
app.use('/api/checkout', require('./routes/api-checkout'));
app.use('/', require('./routes/pages'));

module.exports = app;

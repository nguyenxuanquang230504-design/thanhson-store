const express = require('express');
const productRepository = require('../../data/product-repository');
const { memberDiscountRate, lowStockThreshold, veryLowStockThreshold } = require('../config');
const { getCartSummary, getWishlist } = require('../services/cart-service');
const purchaseService = require('../services/purchase-service');
const { isCloudinaryConfigured } = require('../lib/cloudinary');
const catalogService = require('../services/catalog-service');
const { asyncRoute } = require('../middleware/admin-auth');

const router = express.Router();

function priceBound(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/[.,\s₫]/g, '');
  if (!/^\d{1,12}$/.test(digits)) return '';
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? String(amount) : '';
}

function queryString(options, omit = []) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (omit.includes(key) || value === '' || value == null) continue;
    params.set(key === 'query' ? 'q' : key, String(value));
  }
  return params.toString();
}

async function renderCatalogPage(req, res, searchMode) {
  const query = String(req.query.q || '').trim().slice(0, 100);
  const sortValues = ['newest', 'price-asc', 'price-desc', 'name'];
  const options = {
    query,
    category: String(req.query.category || '').trim(),
    sort: sortValues.includes(String(req.query.sort || 'newest')) ? String(req.query.sort || 'newest') : 'newest',
    minPrice: priceBound(req.query.minPrice),
    maxPrice: priceBound(req.query.maxPrice),
    size: String(req.query.size || '').trim(),
    color: String(req.query.color || '').trim(),
    material: String(req.query.material || '').trim(),
    designStyle: String(req.query.designStyle || '').trim(),
    sale: String(req.query.sale || '').trim(),
    collection: String(req.query.collection || '').trim(),
    brand: String(req.query.brand || '').trim(),
    availableOnly: String(req.query.availableOnly || '').trim() === 'true' ? 'true' : '',
    page: String(req.query.page || '1').trim()
  };
  let priceFilterError = '';
  if (options.minPrice && options.maxPrice && Number(options.minPrice) > Number(options.maxPrice)) {
    options.minPrice = '';
    options.maxPrice = '';
    options.page = '1';
    priceFilterError = 'Khoảng giá không hợp lệ; đã bỏ giới hạn giá để tránh truy vấn sai.';
  }

  const basePath = searchMode ? '/tim-kiem' : '/san-pham';
  const [result, priceBounds] = await Promise.all([
    catalogService.listProducts(options),
    catalogService.getPriceBounds({ category: options.category })
  ]);
  res.render('products', {
    products: result.products,
    pagination: result.pagination,
    ...options,
    searchMode,
    priceBounds,
    priceFilterError,
    filterQuery: queryString(options, ['page']),
    clearPriceHref: `${basePath}?${queryString(options, ['page', 'minPrice', 'maxPrice'])}`,
    clearAllHref: `${basePath}${options.query ? `?q=${encodeURIComponent(options.query)}` : ''}`
  });
}

router.get('/', asyncRoute(async (req, res) => {
  const products = await catalogService.homeProducts();
  res.render('index', products);
}));

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    app: 'Thanh Son Fashion',
    timestamp: new Date().toISOString(),
    products: productRepository.findAll().length,
    cloudinaryConfigured: isCloudinaryConfigured(),
    mongoConnected: require('../lib/mongo').isMongoConnected()
  });
});

router.get(['/dang-nhap', '/tai-khoan'], asyncRoute(async (req, res) => {
  if (req.session.admin) {
    return res.redirect('/admin');
  }
  let userOrders = [];
  if (req.session.user) {
    const user = req.session.user;
    const customerId = String(user.id || user._id || '');
    const username = user.username || '';
    if (require('../lib/mongo').isMongoConnected()) {
      const Order = require('../models/order');
      const conditions = [];
      if (customerId) conditions.push({ customerId });
      if (username) conditions.push({ 'user.username': username });
      if (conditions.length) {
        userOrders = await Order.find({ $or: conditions }).sort({ createdAt: -1 }).limit(20).lean();
      }
    }
  }
  res.render('login', {
    message: req.query.message || '',
    currentUser: req.session.user || null,
    orders: userOrders
  });
}));

router.get('/dang-ky', (req, res) => res.render('register', { message: req.query.message || '' }));

router.get('/tim-kiem', asyncRoute((req, res) => renderCatalogPage(req, res, true)));

router.get('/san-pham', asyncRoute((req, res) => renderCatalogPage(req, res, false)));

router.get('/san-pham/:id', asyncRoute(async (req, res) => {
  const product = await catalogService.findProduct(req.params.id);
  if (!product) return res.status(404).send('Sản phẩm không tồn tại');
  res.render('product-detail', {
    product,
    isWishlisted: getWishlist(req).includes(product.id),
    lowStockThreshold,
    veryLowStockThreshold
  });
}));

router.get('/gio-hang', asyncRoute(async (req, res) => {
  const { items, totalAmount } = await getCartSummary(req);
  res.render('cart', { items, total: totalAmount });
}));

router.get('/yeu-thich', asyncRoute(async (req, res) => {
  const items = (await Promise.all(getWishlist(req).map(id => catalogService.findProduct(id)))).filter(Boolean);
  res.render('wish-list', { items });
}));

router.get('/thanh-toan', asyncRoute(async (req, res) => {
  const summary = await getCartSummary(req);
  if (!summary.items.length) return res.redirect('/gio-hang');
  res.render('checkout', { cart: summary, user: req.session.user || null, discountRate: req.session.user ? memberDiscountRate : 0 });
}));

router.get('/don-hang', asyncRoute(async (req, res) => {
  const cookies = String(req.headers.cookie || '').split(';');
  const accessCookie = cookies.map(cookie => cookie.trim()).find(cookie => cookie.startsWith('tsf-order-access='));
  const accessToken = accessCookie ? accessCookie.slice('tsf-order-access='.length) : '';
  const requestedId = String(req.query.id || req.session.lastOrderId || '').trim();
  let order = null;
  if (req.session.user && requestedId) {
    const user = req.session.user;
    order = await purchaseService.getCustomerOrderById(requestedId, {
      customerId: String(user.id || user._id || user.username || ''),
      username: user.username || ''
    });
  }
  if (!order && accessToken) order = await purchaseService.getCustomerOrderByAccessToken(accessToken);
  if (!order && requestedId && !req.session.user) {
    // If not authenticated and no valid cookie, redirect to login or cart
    return res.redirect('/dang-nhap?message=' + encodeURIComponent('Vui lòng đăng nhập để xem chi tiết đơn hàng.'));
  }
  if (!order) return res.redirect('/gio-hang');
  res.render('order-detail', { order });
}));

module.exports = router;

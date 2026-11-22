const express = require('express');
const path = require('path');
const Category = require('../models/category');
const Product = require('../models/product');
const Order = require('../models/order');
const { isMongoConnected } = require('../lib/mongo');
const { requireAdmin, asyncRoute } = require('../middleware/admin-auth');
const purchaseService = require('../services/purchase-service');

const router = express.Router();
const render = (res, view, locals = {}) => res.render(path.join('admin', view), { admin: null, ...locals });

router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  render(res, 'login');
});

router.get('/change-password', requireAdmin, (req, res) => render(res, 'change-password', { admin: req.session.admin }));

router.get('/', requireAdmin, asyncRoute(async (req, res) => {
  if (!isMongoConnected()) return render(res, 'dashboard', { admin: req.session.admin, error: 'MongoDB chưa kết nối. CMS chưa thể tải dữ liệu.' });
  const [products, categories, orders] = await Promise.all([
    Product.countDocuments({ productStatus: 'PUBLISHED' }),
    Category.countDocuments({ status: 'PUBLISHED' }),
    Order.countDocuments()
  ]);
  render(res, 'dashboard', { admin: req.session.admin, stats: { products, categories, orders } });
}));

router.get('/categories', requireAdmin, (req, res) => render(res, 'categories', { admin: req.session.admin }));
router.get('/products', requireAdmin, (req, res) => render(res, 'products', { admin: req.session.admin }));
router.get('/orders', requireAdmin, asyncRoute(async (req, res) => {
  if (!isMongoConnected()) return render(res, 'orders', { admin: req.session.admin, error: 'MongoDB chưa kết nối. Không thể tải đơn hàng.' });
  await purchaseService.expirePendingMongoOrders();
  const items = await Order.find()
    .select('id createdAt status statusHistory paymentMethod paymentStatus paymentHistory inventoryDeductedAt inventoryRestoredAt customer items totalAmount')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  render(res, 'orders', { admin: req.session.admin, items });
}));

module.exports = router;

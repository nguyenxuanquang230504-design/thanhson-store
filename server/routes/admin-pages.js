const express = require('express');
const path = require('path');
const Category = require('../models/category');
const Product = require('../models/product');
const Order = require('../models/order');
const Customer = require('../models/customer');
const { isMongoConnected } = require('../lib/mongo');
const { requireAdmin, asyncRoute } = require('../middleware/admin-auth');
const purchaseService = require('../services/purchase-service');
const { lowStockThreshold } = require('../config');

const router = express.Router();
const render = (res, view, locals = {}) => res.render(path.join('admin', view), { admin: null, ...locals });

router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  render(res, 'login');
});

router.get('/change-password', requireAdmin, (req, res) => render(res, 'change-password', { admin: req.session.admin }));

router.get('/', requireAdmin, asyncRoute(async (req, res) => {
  if (!isMongoConnected()) return render(res, 'dashboard', { admin: req.session.admin, error: 'MongoDB chưa kết nối. CMS chưa thể tải dữ liệu.' });

  await purchaseService.expirePendingMongoOrders();

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    activeProductsCount,
    lowStockCount,
    outOfStockCount,
    totalCategories,
    totalCustomers,
    allOrders
  ] = await Promise.all([
    Product.countDocuments({ productStatus: 'PUBLISHED' }),
    Product.countDocuments({ productStatus: 'PUBLISHED', stock: { $gt: 0, $lte: lowStockThreshold } }),
    Product.countDocuments({ productStatus: 'PUBLISHED', stock: { $lte: 0 } }),
    Category.countDocuments({ status: 'PUBLISHED' }),
    Customer.countDocuments(),
    Order.find().select('status paymentStatus totalAmount createdAt').lean()
  ]);

  // Accurate aggregation
  let totalPaidRevenue = 0;
  let revenueToday = 0;
  let revenueThisMonth = 0;
  let grossOrderValue = 0;
  let cancelledOrderValue = 0;
  let pendingPaymentValue = 0;

  const orderCounts = {
    total: allOrders.length,
    pending: 0,
    confirmed: 0,
    processing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
    failed: 0
  };

  for (const order of allOrders) {
    const amount = Number(order.totalAmount || 0);
    const createdAt = new Date(order.createdAt);

    if (orderCounts[order.status] !== undefined) {
      orderCounts[order.status] += 1;
    }

    if (order.status === 'cancelled' || order.status === 'failed') {
      cancelledOrderValue += amount;
    } else {
      grossOrderValue += amount;
    }

    if (order.paymentStatus === 'paid') {
      totalPaidRevenue += amount;
      if (createdAt >= startOfToday) {
        revenueToday += amount;
      }
      if (createdAt >= startOfMonth) {
        revenueThisMonth += amount;
      }
    } else if (order.paymentStatus === 'pending') {
      pendingPaymentValue += amount;
    }
  }

  const stats = {
    revenue: {
      totalPaid: totalPaidRevenue,
      today: revenueToday,
      thisMonth: revenueThisMonth,
      gross: grossOrderValue,
      cancelled: cancelledOrderValue,
      pending: pendingPaymentValue
    },
    orders: orderCounts,
    customers: {
      total: totalCustomers
    },
    products: {
      active: activeProductsCount,
      categories: totalCategories
    },
    inventory: {
      lowStock: lowStockCount,
      outOfStock: outOfStockCount
    }
  };

  render(res, 'dashboard', { admin: req.session.admin, stats });
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

router.get('/customers', requireAdmin, (req, res) => render(res, 'customers', { admin: req.session.admin }));
router.get('/reports', requireAdmin, (req, res) => render(res, 'reports', { admin: req.session.admin }));

module.exports = router;

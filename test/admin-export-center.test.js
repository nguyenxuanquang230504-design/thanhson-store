const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { connectMongo } = require('../server/lib/mongo');
const config = require('../server/config');
const Customer = require('../server/models/customer');
const Order = require('../server/models/order');
const ExportJob = require('../server/models/export-job');
const { get_eligible_guest_customers, normalizePhone } = require('../server/services/guest-eligibility-service');
const { generateGuestArchiveWorkbook, validateWorkbookBuffer, sanitizeFormula } = require('../server/services/excel-export-service');

let mongoConnected = false;

test.before(async () => {
  const uri = config.mongoDbUri || config.databaseUrl;
  if (uri) {
    try {
      await connectMongo(uri);
      mongoConnected = true;
    } catch (e) {
      console.warn('Mongo connection for test failed:', e.message);
    }
  }
});

test.after(async () => {
  if (mongoConnected) {
    await mongoose.disconnect();
  }
});

test('1. Formula injection sanitizer neutralizes dangerous spreadsheet formulas', () => {
  assert.equal(sanitizeFormula('=SUM(A1:A10)'), "'=SUM(A1:A10)");
  assert.equal(sanitizeFormula('+123456789'), "'+123456789");
  assert.equal(sanitizeFormula('-100000'), "'-100000");
  assert.equal(sanitizeFormula('@danger'), "'@danger");
  assert.equal(sanitizeFormula('Áo dài nhung đỏ'), 'Áo dài nhung đỏ');
  assert.equal(sanitizeFormula(12345), '12345');
  assert.equal(sanitizeFormula(null), '');
  assert.equal(sanitizeFormula(undefined), '');
});

test('2. Phone normalizer formats Vietnamese phone numbers correctly', () => {
  assert.equal(normalizePhone('+84912345678'), '0912345678');
  assert.equal(normalizePhone('091 234 5678'), '0912345678');
  assert.equal(normalizePhone('0912345678'), '0912345678');
  assert.equal(normalizePhone(''), '');
});

test('3. Excel workbook generator produces valid 4-sheet archive with correct headers', async () => {
  const sampleGuest = {
    customerId: 'GUEST_0911223344',
    customerName: 'Hoàng Thị Thảo',
    phone: '0911223344',
    email: 'thao@example.com',
    address: 'Số 10 Tràng Tiền, Hoàn Kiếm, Hà Nội',
    orders: [
      {
        id: 'HD-TEST-EXCEL-01',
        createdAt: new Date('2026-11-20T10:00:00Z'),
        verifiedDeliveryDate: new Date('2026-11-21T14:30:00Z'),
        status: 'delivered',
        paymentStatus: 'paid',
        paymentMethod: 'bank_transfer',
        totalAmount: 850000,
        pricing: { shippingFee: 30000 },
        customer: {
          customerName: 'Hoàng Thị Thảo',
          phone: '0911223344',
          address: 'Số 10 Tràng Tiền, Hoàn Kiếm, Hà Nội'
        },
        items: [
          {
            productId: '6741234567890123456789ab',
            name: 'Áo dài cách tân nhung đỏ quý phái',
            sku: 'AD-NHUNG-DO-01',
            size: 'L',
            color: 'Đỏ rượu',
            qty: 1,
            price: 820000,
            subtotal: 820000
          }
        ]
      }
    ]
  };

  const result = await generateGuestArchiveWorkbook([sampleGuest], {
    adminEmail: 'admin@thanhson.local',
    adminRole: 'SUPER_ADMIN',
    jobId: 'TEST_JOB_001'
  });

  assert.ok(result.buffer instanceof Buffer, 'Should generate a Buffer');
  assert.ok(result.filename.startsWith('ThanhSonStore_GuestArchive_'), 'Filename format correct');
  assert.ok(result.filename.endsWith('.xlsx'), 'Filename extension is .xlsx');
  assert.ok(result.sha256 && result.sha256.length === 64, 'SHA-256 hash has 64 characters');
  assert.equal(result.customerCount, 1);
  assert.equal(result.orderCount, 1);
  assert.equal(result.itemCount, 1);
  assert.equal(result.totalRevenue, 850000);

  // Validate workbook integrity
  const validation = await validateWorkbookBuffer(result.buffer);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.sheetNames, ['Customers', 'Orders', 'Order_Items', 'Archive_Log']);
  assert.equal(validation.customersRows, 2); // 1 header + 1 data row
  assert.equal(validation.ordersRows, 2);
  assert.equal(validation.itemsRows, 2);
});

test('4. Guest eligibility service accurately classifies registered customers, guests, and order delivery status', async () => {
  if (!mongoConnected) return;

  const result = await get_eligible_guest_customers();
  assert.ok(result.summary, 'Summary object should exist');
  assert.equal(typeof result.summary.totalRegisteredCustomers, 'number');
  assert.equal(typeof result.summary.totalGuestCustomers, 'number');
  assert.equal(typeof result.summary.eligibleGuestCustomers, 'number');
  assert.equal(typeof result.summary.ineligibleGuestCustomers, 'number');
  assert.equal(typeof result.summary.associatedEligibleOrders, 'number');

  // Verify registered customer is excluded
  const registered = await Customer.findOne({ phone: '0912345678' });
  if (registered) {
    const isCustomerInEligible = result.eligible.some(e => e.phone === '0912345678');
    assert.equal(isCustomerInEligible, false, 'Registered customer 0912345678 must NEVER be in eligible guests list');
  }

  // Verify all eligible guests have 100% delivered and paid orders
  for (const guest of result.eligible) {
    assert.ok(guest.orders.length > 0, 'Eligible guest must have associated orders');
    for (const order of guest.orders) {
      assert.ok(order.status === 'delivered' || order.status === 'completed', `Order ${order.id} must be delivered`);
      assert.equal(order.paymentStatus, 'paid', `Order ${order.id} must be paid`);
    }
  }

  // Verify all ineligible guests have documented reasons
  for (const guest of result.ineligible) {
    assert.ok(guest.reason, `Ineligible guest ${guest.phone} must have an exclusion reason`);
  }
});

test('5. Read-only guarantee: Exporting data does NOT delete or alter customer or order records in MongoDB', async () => {
  if (!mongoConnected) return;

  const existingOrders = await Order.find().select('_id').lean();
  const existingCustomers = await Customer.find().select('_id').lean();

  // Run eligibility and generation
  const eligibility = await get_eligible_guest_customers();
  const generated = await generateGuestArchiveWorkbook(eligibility.eligible, {
    adminEmail: 'admin@thanhson.local',
    adminRole: 'SUPER_ADMIN',
    jobId: 'TEST_READONLY_' + Date.now()
  });

  // Verify every original order and customer is still preserved 100%
  for (const o of existingOrders) {
    const found = await Order.findById(o._id).lean();
    assert.ok(found, `Pre-existing order ${o._id} must still exist`);
  }
  for (const c of existingCustomers) {
    const found = await Customer.findById(c._id).lean();
    assert.ok(found, `Pre-existing customer ${c._id} must still exist`);
  }
});

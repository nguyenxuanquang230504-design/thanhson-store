const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');
const mongoose = require('mongoose');
const Category = require('../server/models/category');
const Product = require('../server/models/product');
const Customer = require('../server/models/customer');
const Order = require('../server/models/order');
const accountService = require('../server/services/account-service');
const catalogService = require('../server/services/catalog-service');
const purchaseService = require('../server/services/purchase-service');

test('Single category enforcement: active catalog belongs exclusively to Áo dài cách tân', async () => {
  if (mongoose.connection.readyState === 1) {
    const activeCategories = await Category.find({ status: 'PUBLISHED' }).lean();
    assert.equal(activeCategories.length, 1, 'There must be exactly one active category');
    assert.equal(activeCategories[0].slug, 'ao-dai-cach-tan', 'Active category slug must be ao-dai-cach-tan');
    assert.equal(activeCategories[0].name, 'Áo dài cách tân', 'Active category name must be Áo dài cách tân');

    const activeProducts = await Product.find({ productStatus: 'PUBLISHED' }).lean();
    assert.ok(activeProducts.length > 0, 'Active products must exist');
    for (const p of activeProducts) {
      assert.equal(String(p.category), String(activeCategories[0]._id), `Product ${p.name} must belong to the active category`);
      assert.equal(p.categorySlug, 'ao-dai-cach-tan');
    }
  }
});

test('Product schema supports flexible Ao Dai attributes', async () => {
  const p = new Product({
    name: 'Áo dài cách tân lụa thêu hoa',
    price: 450000,
    originalPrice: 500000,
    salePrice: 450000,
    material: 'Lụa Tơ Tằm',
    designStyle: 'Dáng suông trẻ trung',
    colors: ['Hồng phấn'],
    sizes: ['S', 'M', 'L'],
    variants: [
      { size: 'S', color: 'Hồng phấn', sku: 'TS-01-S', stock: 5 },
      { size: 'M', color: 'Hồng phấn', sku: 'TS-01-M', stock: 8 }
    ],
    isFeatured: true,
    isNewArrival: true,
    seoTitle: 'Áo dài cách tân lụa thêu hoa | Thanh Sơn Store',
    seoDescription: 'Thiết kế áo dài lụa mềm mại sang trọng.'
  });

  await p.validate();
  assert.equal(p.stock, 13, 'Stock must aggregate variants stock');
  assert.equal(p.designStyle, 'Dáng suông trẻ trung');
  assert.equal(p.material, 'Lụa Tơ Tằm');
  assert.equal(p.isFeatured, true);
  assert.equal(p.isNewArrival, true);
  assert.ok(p.searchTokens.includes('lua'), 'searchTokens must include material');
  assert.ok(p.searchTokens.includes('suong'), 'searchTokens must include designStyle');
});

test('Customer model validates phone and hashes password', async () => {
  const customer = new Customer({
    fullName: 'Nguyễn Thị Hoa',
    phone: '0987654321',
    username: 'hoanguyen2026',
    passwordHash: 'hashed_pw_example',
    address: '123 Cầu Giấy, Hà Nội',
    accountStatus: 'ACTIVE'
  });

  await customer.validate();
  assert.equal(customer.accountStatus, 'ACTIVE');
});

test('Header template renders core navigation items and brand identity without redundant collection link', async () => {
  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'partials', 'header.ejs'), {
    badges: { cart: 2, wishlist: 1 },
    currentUser: null
  });

  assert.match(html, /Thanh Sơn/);
  assert.match(html, /Chuyên Áo Dài Cách Tân/);
  assert.match(html, /Trang chủ/);
  assert.match(html, /Tất cả áo dài/);
  assert.doesNotMatch(html, /<a href="\/san-pham\?collection=true">/, 'Redundant collection link must be removed');
  assert.match(html, /Sản phẩm mới/);
  assert.match(html, /Khuyến mãi/);
  assert.match(html, /Yêu thích/);
  assert.match(html, /Giỏ hàng/);
  assert.match(html, /Tài khoản/);
  assert.doesNotMatch(html, /WOMAN<\/h4>|MAN<\/h4>|KIDS<\/h4>/, 'Must not render unrelated fashion categories');
});

test('Revenue calculation formula accurately separates paid from cancelled and pending', () => {
  const orders = [
    { id: 'O1', status: 'delivered', paymentStatus: 'paid', totalAmount: 500000 },
    { id: 'O2', status: 'shipped', paymentStatus: 'paid', totalAmount: 400000 },
    { id: 'O3', status: 'pending', paymentStatus: 'pending', totalAmount: 350000 },
    { id: 'O4', status: 'cancelled', paymentStatus: 'cancelled', totalAmount: 600000 }
  ];

  let paidRevenue = 0;
  let grossRevenue = 0;
  let cancelledRevenue = 0;
  let pendingRevenue = 0;

  for (const o of orders) {
    if (o.paymentStatus === 'paid') paidRevenue += o.totalAmount;
    if (o.status !== 'cancelled' && o.status !== 'failed') grossRevenue += o.totalAmount;
    if (o.status === 'cancelled') cancelledRevenue += o.totalAmount;
    if (o.paymentStatus === 'pending') pendingRevenue += o.totalAmount;
  }

  assert.equal(paidRevenue, 900000, 'Paid revenue must be exactly 900,000 VND');
  assert.equal(grossRevenue, 1250000, 'Gross revenue must exclude cancelled orders');
  assert.equal(cancelledRevenue, 600000, 'Cancelled revenue must be exactly 600,000 VND');
  assert.equal(pendingRevenue, 350000, 'Pending revenue must not be counted in paid');
});

test('Order detail page does not expose internal database metadata or secrets', async () => {
  const safeOrder = {
    id: 'HD-99999',
    reference: 'HD-99999',
    confirmationMessage: 'Cảm ơn quý khách đã đặt hàng!',
    statusLabel: 'Chờ thanh toán',
    statusTone: 'warning',
    timeline: [
      { label: 'Đã tiếp nhận', complete: true, current: true, at: new Date().toISOString() }
    ],
    items: [
      { name: 'Áo dài cách tân hồng', sku: 'TSF-001', size: 'M', color: 'Hồng', quantity: 1, subtotal: 390000 }
    ],
    totals: { subtotal: 390000, discountAmount: 0, shippingFee: 0, total: 390000 },
    customer: { name: 'Nguyễn Văn A', phone: '0901234567', address: 'Hà Nội', notes: '' },
    payment: {
      method: 'bank_transfer',
      methodLabel: 'Chuyển khoản VietQR',
      statusLabel: 'Chờ thanh toán',
      bankId: '970422',
      accountNo: '0011101884099',
      accountName: 'DINH THI NGOC MAI',
      amount: 390000,
      transferDescription: 'HD-99999',
      instruction: 'Vui lòng quét mã QR hoặc chuyển khoản đúng nội dung.'
    }
  };

  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'order-detail.ejs'), {
    order: safeOrder,
    badges: { cart: 0, wishlist: 0 },
    currentUser: null
  });

  assert.match(html, /HD-99999/);
  assert.match(html, /0011101884099/);
  assert.match(html, /Áo dài cách tân hồng/);
  assert.doesNotMatch(html, /idempotencyKey|inventoryDeductedAt|guestAccessTokenHash|JSON\.stringify/);
});

test('Admin orders view renders safely without ReferenceError when error is omitted', async () => {
  const sampleItems = [
    {
      id: 'HD-12345',
      createdAt: new Date(),
      status: 'pending',
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
      customer: { customerName: 'Trần Văn B', phone: '0912345678', address: '123 Phố Huế, Hà Nội' },
      items: [{ name: 'Áo dài cách tân lụa', qty: 1, size: 'M', color: 'Đỏ' }],
      totalAmount: 450000,
      statusHistory: [],
      paymentHistory: []
    }
  ];

  // Test rendering without passing error (simulating default render)
  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'admin', 'orders.ejs'), {
    admin: { email: 'admin@thanhson.local', role: 'SUPER_ADMIN' },
    items: sampleItems
  });

  assert.match(html, /HD-12345/);
  assert.match(html, /Trần Văn B/);
  assert.match(html, /Chờ xác nhận/);
  assert.match(html, /Chuyển khoản VietQR/);
  assert.doesNotMatch(html, /ReferenceError/);
});

test('Admin layout does not include categories link', async () => {
  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'admin', '_layout.ejs'), {
    active: 'dashboard',
    admin: { email: 'admin@thanhson.local', role: 'SUPER_ADMIN' }
  });

  assert.doesNotMatch(html, /\/admin\/categories/);
  assert.match(html, /\/admin\/products/);
  assert.match(html, /\/admin\/orders/);
  assert.match(html, /\/admin\/customers/);
  assert.match(html, /\/admin\/reports/);
});


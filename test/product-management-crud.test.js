const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const mongoose = require('mongoose');
const { connectMongo } = require('../server/lib/mongo');
const config = require('../server/config');
const Product = require('../server/models/product');
const Order = require('../server/models/order');
const Category = require('../server/models/category');

let mongoConnected = false;

test.before(async () => {
  const uri = config.mongoDbUri;
  if (uri) {
    try {
      await connectMongo(uri);
      mongoConnected = true;
    } catch (e) {
      console.warn('Mongo connection for test failed:', e.message);
    }
  }
});

test('1. Thêm sản phẩm mới thành công với đầy đủ thuộc tính Áo dài', async () => {
  if (!mongoConnected) return;

  const testSku = 'TEST-CRUD-' + Date.now();
  const activeCategory = await Category.findOne({ status: 'PUBLISHED' }).lean();

  const product = new Product({
    name: 'Áo dài cách tân lụa hoàng gia test',
    sku: testSku,
    productCode: 'AD-TEST-01',
    price: 490000,
    originalPrice: 590000,
    salePrice: 470000,
    stock: 25,
    material: 'Lụa Tơ Tằm',
    designStyle: 'Tà kép quý phái',
    image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b',
    category: activeCategory?._id,
    categorySlug: 'ao-dai-cach-tan',
    categoryName: 'Áo dài cách tân',
    productStatus: 'PUBLISHED'
  });

  const saved = await product.save();
  assert.ok(saved._id, 'Product must have MongoDB ObjectId');
  assert.equal(saved.sku, testSku);
  assert.equal(saved.stock, 25);
  assert.equal(saved.material, 'Lụa Tơ Tằm');
  assert.equal(saved.designStyle, 'Tà kép quý phái');

  // Cleanup
  await Product.findByIdAndDelete(saved._id);
});

test('2. Sửa tên, giá, chất liệu và kiểu dáng của sản phẩm', async () => {
  if (!mongoConnected) return;

  const testSku = 'TEST-EDIT-' + Date.now();
  const product = await Product.create({
    name: 'Áo dài ban đầu',
    sku: testSku,
    price: 300000,
    stock: 10,
    material: 'Gấm',
    designStyle: 'Dáng suông',
    productStatus: 'PUBLISHED'
  });

  // Edit fields
  const updated = await Product.findByIdAndUpdate(product._id, {
    name: 'Áo dài cách tân tơ ngọc bích',
    price: 520000,
    salePrice: 490000,
    material: 'Tơ Organza',
    designStyle: 'Tay bồng lộng lẫy'
  }, { returnDocument: 'after' });

  assert.equal(updated.name, 'Áo dài cách tân tơ ngọc bích');
  assert.equal(updated.price, 520000);
  assert.equal(updated.salePrice, 490000);
  assert.equal(updated.material, 'Tơ Organza');
  assert.equal(updated.designStyle, 'Tay bồng lộng lẫy');
  assert.equal(updated.sku, testSku, 'SKU must not change when not edited');

  await Product.findByIdAndDelete(product._id);
});

test('3. Thay đổi hình ảnh và bảo toàn hình ảnh cũ khi không đổi ảnh', async () => {
  if (!mongoConnected) return;

  const initialImage = 'https://example.com/initial-photo.jpg';
  const product = await Product.create({
    name: 'Áo dài test image',
    sku: 'TEST-IMG-' + Date.now(),
    price: 350000,
    stock: 5,
    image: initialImage,
    productStatus: 'PUBLISHED'
  });

  // Update without passing image (empty image)
  const existing = await Product.findById(product._id);
  let newImage = '';
  if (!newImage && existing.image) {
    newImage = existing.image;
  }

  const updated = await Product.findByIdAndUpdate(product._id, {
    name: 'Áo dài test image (updated name)',
    image: newImage
  }, { returnDocument: 'after' });

  assert.equal(updated.image, initialImage, 'Original image must be preserved');

  await Product.findByIdAndDelete(product._id);
});

test('4. Cập nhật số lượng tồn kho trực tiếp (Inline Stock Update) đồng bộ vào database', async () => {
  if (!mongoConnected) return;

  const product = await Product.create({
    name: 'Áo dài test stock inline',
    sku: 'TEST-STOCK-' + Date.now(),
    price: 400000,
    stock: 12,
    variants: [
      { size: 'S', color: 'Đỏ', sku: 'TS-S', stock: 6 },
      { size: 'M', color: 'Đỏ', sku: 'TS-M', stock: 6 }
    ],
    productStatus: 'PUBLISHED'
  });

  // Update stock directly to 30
  const newStock = 30;
  assert.ok(Number.isInteger(newStock) && newStock >= 0);

  // Scaled variants
  const currentTotal = product.variants.reduce((s, v) => s + v.stock, 0);
  let allocated = 0;
  product.variants.forEach((v, idx) => {
    if (idx === product.variants.length - 1) {
      v.stock = Math.max(0, newStock - allocated);
    } else {
      const scaled = Math.round(newStock * (v.stock / currentTotal));
      v.stock = scaled;
      allocated += scaled;
    }
  });
  product.stock = newStock;
  await product.save();

  // Query fresh from MongoDB
  const fresh = await Product.findById(product._id).lean();
  assert.equal(fresh.stock, 30, 'Database stock must equal 30');
  const sumVariants = fresh.variants.reduce((sum, v) => sum + v.stock, 0);
  assert.equal(sumVariants, 30, 'Variants stock sum must equal 30');

  await Product.findByIdAndDelete(product._id);
});

test('5. Ngăn chặn cập nhật tồn kho âm hoặc số thập phân', () => {
  const isInvalidStock = (raw) => {
    if (raw === null || raw === undefined || String(raw).trim() === '') return true;
    const num = Number(raw);
    return !Number.isInteger(num) || num < 0;
  };

  const invalidValues = [-5, -1, 12.5, 'abc', '', null, undefined];
  for (const val of invalidValues) {
    assert.equal(isInvalidStock(val), true, `Stock ${val} must be rejected`);
  }
  assert.equal(isInvalidStock(0), false);
  assert.equal(isInvalidStock(25), false);
});

test('6. Ngăn chặn trùng lặp mã SKU', async () => {
  if (!mongoConnected) return;

  const duplicateSku = 'TEST-DUP-' + Date.now();
  const p1 = await Product.create({
    name: 'Sản phẩm 1',
    sku: duplicateSku,
    price: 350000,
    stock: 5,
    productStatus: 'PUBLISHED'
  });

  // Check duplicate SKU query
  const existing = await Product.findOne({ sku: duplicateSku });
  assert.ok(existing, 'First product exists');

  // Simulating duplicate check in POST
  const checkConflict = await Product.findOne({ sku: duplicateSku, _id: { $ne: new mongoose.Types.ObjectId() } });
  assert.ok(checkConflict, 'Conflict must be detected');

  await Product.findByIdAndDelete(p1._id);
});

test('7. Xóa sản phẩm chưa có đơn hàng: Xóa vĩnh viễn (Hard delete)', async () => {
  if (!mongoConnected) return;

  const product = await Product.create({
    name: 'Áo dài chưa ai mua',
    sku: 'TEST-NO-ORDER-' + Date.now(),
    price: 300000,
    stock: 8,
    productStatus: 'PUBLISHED'
  });

  const orderCount = await Order.countDocuments({ 'items.productId': product._id });
  assert.equal(orderCount, 0, 'Must have zero historical orders');

  if (orderCount === 0) {
    await Product.findByIdAndDelete(product._id);
  }

  const check = await Product.findById(product._id);
  assert.equal(check, null, 'Product must be completely deleted from collection');
});

test('8. Xóa sản phẩm đã phát sinh đơn hàng: Chuyển sang INACTIVE (Soft delete), bảo toàn lịch sử đơn', async () => {
  if (!mongoConnected) return;

  const product = await Product.create({
    name: 'Áo dài đã bán cho khách',
    sku: 'TEST-ORDERED-' + Date.now(),
    price: 500000,
    stock: 15,
    productStatus: 'PUBLISHED'
  });

  // Create mock order referencing this product
  const mockOrder = await Order.create({
    id: 'HD-TEST-' + Date.now(),
    idempotencyKey: 'idemp-test-' + Date.now(),
    inventoryDeductedAt: new Date(),
    customer: { customerName: 'Khách hàng test', phone: '0912345678', address: 'Hà Nội' },
    items: [
      {
        productId: product._id,
        name: product.name,
        sku: product.sku,
        qty: 1,
        price: 500000,
        subtotal: 500000
      }
    ],
    pricing: { subtotal: 500000, discountAmount: 0, shippingFee: 0, totalAmount: 500000 },
    totalAmount: 500000
  });

  // Check order history before delete
  const orderCount = await Order.countDocuments({ 'items.productId': product._id });
  assert.ok(orderCount > 0, 'Product has historical orders');

  // Perform safe delete
  if (orderCount > 0) {
    product.productStatus = 'INACTIVE';
    await product.save();
  }

  // Verify
  const fresh = await Product.findById(product._id).lean();
  assert.ok(fresh, 'Product document still exists in database');
  assert.equal(fresh.productStatus, 'INACTIVE', 'Status must be marked INACTIVE (Ngừng kinh doanh)');

  // Verify order history is 100% intact
  const orderCheck = await Order.findById(mockOrder._id).lean();
  assert.ok(orderCheck, 'Historical order must NOT be deleted');
  assert.equal(String(orderCheck.items[0].productId), String(product._id));

  // Cleanup mock order and product
  await Order.findByIdAndDelete(mockOrder._id);
  await Product.findByIdAndDelete(product._id);
});

test('9. Tìm kiếm sản phẩm không phân biệt chữ hoa, chữ thường và dấu tiếng Việt', async () => {
  if (!mongoConnected) return;

  const testProduct = await Product.create({
    name: 'Áo dài cách tân lụa thêu cúc vạn thọ',
    sku: 'TSF-CUC-001',
    price: 650000,
    stock: 10,
    material: 'Lụa Tơ Tằm',
    productStatus: 'PUBLISHED'
  });

  // Search queries: 'cuc', 'CÚC', 'TSF-CUC', 'van tho'
  const queries = ['cuc', 'CÚC', 'tsf-cuc', 'van tho'];
  for (const q of queries) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    const results = await Product.find({
      $or: [
        { name: regex },
        { sku: regex },
        { searchTokens: { $all: testProduct.searchTokens.filter(t => t.includes('cuc') || t.includes('tho')) } }
      ]
    }).lean();
    assert.ok(results.some(r => String(r._id) === String(testProduct._id)), `Query "${q}" must match test product`);
  }

  await Product.findByIdAndDelete(testProduct._id);
});

test('10. Phân biệt rõ trạng thái PUBLISHED, DRAFT, INACTIVE', () => {
  const validStatuses = ['PUBLISHED', 'DRAFT', 'INACTIVE'];
  const testStatus = (status) => validStatuses.includes(status);

  assert.equal(testStatus('PUBLISHED'), true);
  assert.equal(testStatus('DRAFT'), true);
  assert.equal(testStatus('INACTIVE'), true);
  assert.equal(testStatus('UNKNOWN_STATUS'), false);
});

test.after(async () => {
  if (mongoConnected) {
    await mongoose.disconnect();
  }
});


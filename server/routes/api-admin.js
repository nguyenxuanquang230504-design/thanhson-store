const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const AdminUser = require('../models/admin-user');
const Category = require('../models/category');
const Product = require('../models/product');
const Order = require('../models/order');
const Customer = require('../models/customer');
const ExportJob = require('../models/export-job');
const accountService = require('../services/account-service');
const { isMongoConnected } = require('../lib/mongo');
const { slugify, searchTokens } = require('../lib/search-text');
const { requireAdmin, requireRole, asyncRoute } = require('../middleware/admin-auth');
const { getCloudinary, isCloudinaryConfigured } = require('../lib/cloudinary');
const { lowStockThreshold } = require('../config');
const purchaseService = require('../services/purchase-service');
const { get_eligible_guest_customers } = require('../services/guest-eligibility-service');
const { generateGuestArchiveWorkbook, validateWorkbookBuffer } = require('../services/excel-export-service');
const fs = require('fs');
const path = require('path');

const EXPORTS_DIR = path.join(__dirname, '..', '..', 'data', 'exports');

const router = express.Router();

function requireMongo(res) {
  if (isMongoConnected()) return false;
  res.status(503).json({ ok: false, message: 'MongoDB chưa kết nối. Không thể sử dụng CMS.' });
  return true;
}

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

function normalizeCategoryBody(body) {
  const name = String(body.name || '').trim();
  const slug = slugify(body.slug || name);
  const displayOrder = Number(body.displayOrder || 0);
  if (!name || !slug || !Number.isInteger(displayOrder)) throw Object.assign(new Error('Tên, slug và thứ tự hiển thị không hợp lệ.'), { status: 400 });
  return {
    name,
    slug,
    description: String(body.description || '').trim(),
    image: String(body.image || '').trim(),
    banner: String(body.banner || '').trim(),
    parent: body.parent || null,
    displayOrder,
    status: ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(body.status) ? body.status : 'DRAFT',
    seoTitle: String(body.seoTitle || '').trim(),
    seoDescription: String(body.seoDescription || '').trim()
  };
}

router.post('/login', asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = await AdminUser.findOne({ email, accountStatus: 'ACTIVE' });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ ok: false, message: 'Email hoặc mật khẩu không đúng.' });
  }
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  user.lastLoginAt = new Date();
  await user.save();
  req.session.admin = {
    id: String(user._id),
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword
  };
  await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
  res.json({ ok: true, redirect: user.mustChangePassword ? '/admin/change-password' : '/admin' });
}));

router.post('/logout', requireAdmin, (req, res) => {
  req.session.admin = null;
  req.session.save(error => {
    if (error) return res.status(500).json({ ok: false, message: 'Không thể đăng xuất.' });
    res.json({ ok: true });
  });
});

router.post('/change-password', requireAdmin, asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  const password = String(req.body.password || '');
  if (password.length < 12) return res.status(400).json({ ok: false, message: 'Mật khẩu mới cần ít nhất 12 ký tự.' });
  const user = await AdminUser.findById(req.session.admin.id);
  if (!user) return res.status(401).json({ ok: false, message: 'Tài khoản không còn hợp lệ.' });
  user.passwordHash = await bcrypt.hash(password, 12);
  user.mustChangePassword = false;
  await user.save();
  req.session.admin.mustChangePassword = false;
  await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
  res.json({ ok: true, redirect: '/admin' });
}));

router.post('/images', requireAdmin, requireRole('SUPER_ADMIN', 'ADMIN'), asyncRoute(async (req, res) => {
  if (!isCloudinaryConfigured()) return res.status(503).json({ ok: false, message: 'Cloudinary chưa được cấu hình.' });
  const dataUrl = String(req.body.dataUrl || '');
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return res.status(400).json({ ok: false, message: 'Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.' });
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) return res.status(400).json({ ok: false, message: 'Ảnh phải nhỏ hơn 5 MB.' });
  const signatures = {
    'image/jpeg': buffer[0] === 0xff && buffer[1] === 0xd8,
    'image/png': buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    'image/webp': buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
  };
  if (!signatures[match[1]]) return res.status(400).json({ ok: false, message: 'Nội dung tệp không khớp định dạng ảnh.' });
  const cloudinary = getCloudinary();
  try {
    const uploaded = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream({ folder: 'thanh-son/products', resource_type: 'image' }, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }).end(buffer);
    });
    res.status(201).json({ ok: true, image: uploaded.secure_url, publicId: uploaded.public_id });
  } catch (uploadErr) {
    console.error('Cloudinary upload error:', uploadErr?.message || uploadErr);
    const detail = uploadErr?.message ? ` (${uploadErr.message})` : '';
    res.status(502).json({ ok: false, message: `Cloudinary từ chối tải ảnh${detail}. Kiểm tra API credentials.` });
  }
}));

router.use(requireAdmin);

router.get('/categories', requireRole('SUPER_ADMIN', 'ADMIN'), asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  const categories = await Category.find().populate('parent', 'name').sort({ displayOrder: 1, name: 1 }).lean();
  const counts = await Product.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]);
  const countMap = new Map(counts.map(item => [String(item._id), item.count]));
  res.json({ ok: true, items: categories.map(item => ({ ...item, productCount: countMap.get(String(item._id)) || 0 })) });
}));

router.post('/categories', requireRole('SUPER_ADMIN', 'ADMIN'), asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  const body = normalizeCategoryBody(req.body);
  const activeCount = await Category.countDocuments({ status: 'PUBLISHED' });
  if (activeCount >= 1 && body.status === 'PUBLISHED') {
    return res.status(400).json({ ok: false, message: 'Thanh Sơn Store chỉ sử dụng duy nhất một danh mục đang hoạt động: Áo dài cách tân.' });
  }
  if (body.parent && !isValidId(body.parent)) return res.status(400).json({ ok: false, message: 'Danh mục cha không hợp lệ.' });
  if (body.parent && !(await Category.exists({ _id: body.parent, status: { $ne: 'ARCHIVED' } }))) {
    return res.status(400).json({ ok: false, message: 'Không tìm thấy danh mục cha.' });
  }
  const item = await Category.create(body);
  res.status(201).json({ ok: true, item });
}));

router.put('/categories/:id', requireRole('SUPER_ADMIN', 'ADMIN'), asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  if (!isValidId(req.params.id)) return res.status(400).json({ ok: false, message: 'ID danh mục không hợp lệ.' });
  const body = normalizeCategoryBody(req.body);

  const existing = await Category.findById(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, message: 'Không tìm thấy danh mục.' });

  if (existing.slug === 'ao-dai-cach-tan' && body.status === 'ARCHIVED') {
    return res.status(400).json({ ok: false, message: 'Không thể lưu trữ danh mục hoạt động duy nhất của cửa hàng.' });
  }

  if (body.parent) {
    if (!isValidId(body.parent) || body.parent === req.params.id) return res.status(400).json({ ok: false, message: 'Danh mục cha không hợp lệ.' });
    let parent = await Category.findById(body.parent).select('parent');
    let depth = 0;
    while (parent && depth < 32) {
      if (String(parent._id) === req.params.id) return res.status(400).json({ ok: false, message: 'Không thể tạo vòng lặp danh mục.' });
      parent = parent.parent ? await Category.findById(parent.parent).select('parent') : null;
      depth += 1;
    }
    if (depth >= 32) return res.status(400).json({ ok: false, message: 'Cấu trúc danh mục cha không hợp lệ.' });
  }
  const item = await Category.findByIdAndUpdate(req.params.id, { ...body, updatedAt: new Date() }, { new: true, runValidators: true });
  res.json({ ok: true, item });
}));

router.delete('/categories/:id', requireRole('SUPER_ADMIN'), asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  if (!isValidId(req.params.id)) return res.status(400).json({ ok: false, message: 'ID danh mục không hợp lệ.' });
  const item = await Category.findById(req.params.id);
  if (!item) return res.status(404).json({ ok: false, message: 'Không tìm thấy danh mục.' });
  if (item.slug === 'ao-dai-cach-tan' || item.status === 'PUBLISHED') {
    const activeCount = await Category.countDocuments({ status: 'PUBLISHED' });
    if (activeCount <= 1) {
      return res.status(400).json({ ok: false, message: 'Không thể xóa hoặc lưu trữ danh mục hoạt động duy nhất của cửa hàng.' });
    }
  }
  const [products, children] = await Promise.all([
    Product.countDocuments({ category: req.params.id }),
    Category.countDocuments({ parent: req.params.id })
  ]);
  if (products || children) return res.status(409).json({ ok: false, products, children, message: 'Danh mục đang được sử dụng. Hãy chuyển sản phẩm/danh mục con hoặc lưu trữ.' });
  item.status = 'ARCHIVED';
  await item.save();
  res.json({ ok: true });
}));

router.get('/products', requireRole('SUPER_ADMIN', 'ADMIN', 'STAFF'), asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  const query = String(req.query.q || '').trim().slice(0, 100);
  const filter = {};

  // Status Filter
  if (req.query.status && req.query.status !== 'all') {
    if (req.query.status === 'PUBLISHED') {
      filter.productStatus = 'PUBLISHED';
    } else if (req.query.status === 'DRAFT') {
      filter.productStatus = 'DRAFT';
    } else if (req.query.status === 'INACTIVE') {
      filter.productStatus = { $in: ['INACTIVE', 'ARCHIVED', 'UNPUBLISHED'] };
    } else {
      filter.productStatus = req.query.status;
    }
  }

  // Stock Filter
  if (req.query.stockStatus === 'in_stock') {
    filter.stock = { $gt: 10 };
  } else if (req.query.stockStatus === 'low' || req.query.stockStatus === 'low_stock') {
    filter.stock = { $gt: 0, $lte: 10 };
  } else if (req.query.stockStatus === 'out' || req.query.stockStatus === 'out_of_stock') {
    filter.stock = { $lte: 0 };
  }

  // Search by Name, SKU, productCode, and tokens (case & accent insensitive)
  if (query) {
    const tokens = searchTokens([query]);
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    const orConditions = [
      { name: regex },
      { sku: regex },
      { productCode: regex }
    ];
    if (tokens.length) {
      orConditions.push({ searchTokens: { $all: tokens } });
    }
    filter.$or = orConditions;
  }

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const perPage = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const [items, total] = await Promise.all([
    Product.find(filter).populate('category', 'name slug').sort({ updatedAt: -1 }).skip((page - 1) * perPage).limit(perPage).lean(),
    Product.countDocuments(filter)
  ]);
  res.json({ ok: true, items, pagination: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) } });
}));

function productBody(body) {
  const name = String(body.name || body.productName || '').trim();
  const price = Number(body.price ?? body.sellingPrice);
  const requestedStock = Number(body.stock || 0);
  if (!name || !Number.isFinite(price) || price < 0 || !Number.isInteger(requestedStock) || requestedStock < 0) {
    throw Object.assign(new Error('Tên, giá hoặc tồn kho không hợp lệ.'), { status: 400 });
  }
  const tags = Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(',');
  const variantInputs = Array.isArray(body.variants) ? body.variants : [];
  const variants = variantInputs.map((input, index) => {
    const size = String(input.size || '').trim();
    const color = String(input.color || '').trim();
    const stock = Number(input.stock);
    const priceAdjustment = Number(input.priceAdjustment || 0);
    if ((!size && !color) || !Number.isInteger(stock) || stock < 0 || !Number.isFinite(priceAdjustment)) {
      throw Object.assign(new Error(`Thông tin tồn kho ở biến thể ${index + 1} không hợp lệ.`), { status: 400 });
    }
    if (input._id && !mongoose.isValidObjectId(input._id)) {
      throw Object.assign(new Error(`ID biến thể ${index + 1} không hợp lệ.`), { status: 400 });
    }
    return {
      ...(input._id ? { _id: input._id } : {}),
      size,
      color,
      sku: String(input.sku || '').trim().toUpperCase(),
      stock,
      priceAdjustment,
      available: input.available !== false && input.available !== 'false'
    };
  });
  const combinations = variants.map(variant => `${variant.size.toLocaleLowerCase('vi')}|${variant.color.toLocaleLowerCase('vi')}`);
  if (new Set(combinations).size !== combinations.length) {
    throw Object.assign(new Error('Mỗi kết hợp kích cỡ và màu sắc chỉ được khai báo một lần.'), { status: 400 });
  }
  const requestedSizes = Array.isArray(body.sizes) ? body.sizes : String(body.sizes || '').split(',');
  const requestedColors = Array.isArray(body.colors) ? body.colors : String(body.colors || '').split(',');
  if (!variants.length && (requestedSizes.some(value => String(value).trim()) || requestedColors.some(value => String(value).trim()))) {
    throw Object.assign(new Error('Cần khai báo tồn kho cho từng kích cỡ/màu sắc.'), { status: 400 });
  }
  const sizes = [...new Set(variants.map(variant => variant.size).filter(Boolean))];
  const colors = [...new Set(variants.map(variant => variant.color).filter(Boolean))];
  const stock = variants.length ? variants.reduce((total, variant) => total + variant.stock, 0) : requestedStock;
  const fields = {
    name, productName: name, slug: slugify(body.slug || name),
    productCode: String(body.productCode || '').trim().toUpperCase(),
    sku: String(body.sku || '').trim().toUpperCase(),
    price, originalPrice: Number(body.originalPrice || price),
    salePrice: body.salePrice === '' || body.salePrice == null ? null : Number(body.salePrice),
    stock, description: String(body.description || '').trim(),
    shortDescription: String(body.shortDescription || '').trim(),
    image: String(body.image || '').trim(),
    images: Array.isArray(body.images) ? body.images : String(body.images || '').split(','),
    category: body.category || null,
    brand: String(body.brand || '').trim(),
    material: String(body.material || '').trim(),
    designStyle: String(body.designStyle || '').trim(),
    subcategory: String(body.subcategory || '').trim(),
    genderTarget: String(body.genderTarget || '').trim(),
    tags: tags.map(value => String(value).trim()).filter(Boolean),
    sizes,
    colors,
    variants,
    productStatus: ['DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED', 'INACTIVE'].includes(body.productStatus) ? body.productStatus : 'PUBLISHED',
    isFeatured: body.isFeatured === true || body.isFeatured === 'true',
    isNewArrival: body.isNewArrival === true || body.isNewArrival === 'true',
    seoTitle: String(body.seoTitle || '').trim(),
    seoDescription: String(body.seoDescription || '').trim()
  };
  if (fields.salePrice != null && (!Number.isFinite(fields.salePrice) || fields.salePrice < 0)) throw Object.assign(new Error('Giá khuyến mãi không hợp lệ.'), { status: 400 });
  if (fields.originalPrice != null && fields.originalPrice > 0 && fields.originalPrice < fields.price) {
    throw Object.assign(new Error('Giá gốc niêm yết phải lớn hơn hoặc bằng giá bán thực tế.'), { status: 400 });
  }
  if (fields.salePrice != null && fields.salePrice > 0 && fields.salePrice >= fields.price) {
    throw Object.assign(new Error('Giá khuyến mãi phải nhỏ hơn giá bán thực tế.'), { status: 400 });
  }
  fields.searchTokens = searchTokens([
    fields.name, fields.productCode, fields.sku, fields.description,
    fields.shortDescription, fields.brand, fields.material, fields.designStyle,
    fields.subcategory, fields.genderTarget, ...fields.tags,
    ...fields.sizes, ...fields.colors,
    ...fields.variants.flatMap(variant => [variant.size, variant.color, variant.sku])
  ]);
  return fields;
}

router.post('/products', requireRole('SUPER_ADMIN', 'ADMIN'), asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  const body = productBody(req.body);

  // Validate SKU uniqueness
  if (body.sku) {
    const existingSku = await Product.findOne({ sku: body.sku });
    if (existingSku) {
      return res.status(400).json({ ok: false, message: `Mã SKU "${body.sku}" đã tồn tại trên hệ thống. Vui lòng nhập mã SKU khác.` });
    }
  }

  if (body.category) {
    const category = await Category.findById(body.category).select('slug name');
    if (!category) return res.status(400).json({ ok: false, message: 'Danh mục không tồn tại.' });
    body.categorySlug = category.slug;
    body.categoryName = category.name;
  } else {
    const activeCategory = await Category.findOne({ status: 'PUBLISHED' }).select('_id slug name');
    if (activeCategory) {
      body.category = activeCategory._id;
      body.categorySlug = activeCategory.slug;
      body.categoryName = activeCategory.name;
    }
  }
  const item = await Product.create(body);
  res.status(201).json({ ok: true, item, message: 'Đã thêm sản phẩm mới thành công.' });
}));

router.put('/products/:id', requireRole('SUPER_ADMIN', 'ADMIN'), asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  if (!isValidId(req.params.id)) return res.status(400).json({ ok: false, message: 'ID sản phẩm không hợp lệ.' });
  
  const existingProduct = await Product.findById(req.params.id);
  if (!existingProduct) return res.status(404).json({ ok: false, message: 'Không tìm thấy sản phẩm.' });

  const body = productBody(req.body);

  // Validate SKU uniqueness across other products
  if (body.sku) {
    const duplicateSku = await Product.findOne({ sku: body.sku, _id: { $ne: req.params.id } });
    if (duplicateSku) {
      return res.status(400).json({ ok: false, message: `Mã SKU "${body.sku}" đã được sử dụng bởi sản phẩm khác.` });
    }
  }

  // Preserve existing image if user did not provide a new one
  if (!body.image && existingProduct.image) {
    body.image = existingProduct.image;
  }

  if (body.category) {
    const category = await Category.findById(body.category).select('slug name');
    if (!category) return res.status(400).json({ ok: false, message: 'Danh mục không tồn tại.' });
    body.categorySlug = category.slug;
    body.categoryName = category.name;
  } else {
    const activeCategory = await Category.findOne({ status: 'PUBLISHED' }).select('_id slug name');
    if (activeCategory) {
      body.category = activeCategory._id;
      body.categorySlug = activeCategory.slug;
      body.categoryName = activeCategory.name;
    }
  }
  const item = await Product.findByIdAndUpdate(req.params.id, { ...body, updatedAt: new Date() }, { new: true, runValidators: true });
  res.json({ ok: true, item, message: 'Đã cập nhật sản phẩm thành công.' });
}));

// Quick Direct Stock Update (Inline Editing in Table)
router.patch('/products/:id/stock', requireRole('SUPER_ADMIN', 'ADMIN'), asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  if (!isValidId(req.params.id)) return res.status(400).json({ ok: false, message: 'ID sản phẩm không hợp lệ.' });

  const rawStock = req.body.stock;
  const stock = Number(rawStock);
  if (!Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ ok: false, message: 'Số lượng tồn kho phải là số nguyên không âm (≥ 0).' });
  }

  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ ok: false, message: 'Không tìm thấy sản phẩm.' });

  // If product has variants, update variants stock proportionally
  if (product.variants && product.variants.length > 0) {
    const currentTotal = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
    if (currentTotal === 0) {
      const perVariant = Math.floor(stock / product.variants.length);
      const rem = stock % product.variants.length;
      product.variants.forEach((v, idx) => {
        v.stock = perVariant + (idx === 0 ? rem : 0);
      });
    } else {
      let allocated = 0;
      product.variants.forEach((v, idx) => {
        if (idx === product.variants.length - 1) {
          v.stock = Math.max(0, stock - allocated);
        } else {
          const ratio = v.stock / currentTotal;
          const newVarStock = Math.round(stock * ratio);
          v.stock = newVarStock;
          allocated += newVarStock;
        }
      });
    }
  }

  product.stock = stock;
  product.updatedAt = new Date();
  await product.save();

  res.json({
    ok: true,
    item: product,
    stock: product.stock,
    message: `Đã cập nhật tồn kho sản phẩm "${product.name}" thành ${product.stock}.`
  });
}));

// Delete Product with Transaction Integrity Check
router.delete('/products/:id', requireRole('SUPER_ADMIN', 'ADMIN'), asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  if (!isValidId(req.params.id)) return res.status(400).json({ ok: false, message: 'ID sản phẩm không hợp lệ.' });

  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ ok: false, message: 'Không tìm thấy sản phẩm.' });

  // Check if product is referenced in historical orders
  const orderCount = await Order.countDocuments({ 'items.productId': req.params.id });

  if (orderCount === 0) {
    // Safe to hard delete
    await Product.findByIdAndDelete(req.params.id);
    return res.json({
      ok: true,
      action: 'HARD_DELETE',
      message: `Đã xóa vĩnh viễn sản phẩm "${product.name}" (SKU: ${product.sku || 'N/A'}) khỏi hệ thống.`
    });
  } else {
    // Soft delete / mark as INACTIVE to protect transaction history
    product.productStatus = 'INACTIVE';
    product.updatedAt = new Date();
    await product.save();
    return res.json({
      ok: true,
      action: 'SOFT_DELETE',
      message: `Sản phẩm "${product.name}" đã phát sinh ${orderCount} đơn hàng trong lịch sử. Hệ thống đã chuyển trạng thái sang "Ngừng kinh doanh" để bảo vệ lịch sử giao dịch.`
    });
  }
}));

router.get('/orders', requireRole('SUPER_ADMIN', 'ADMIN', 'STAFF'), asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  await purchaseService.expirePendingMongoOrders();
  const items = await Order.find()
    .select('id createdAt status statusHistory paymentMethod paymentStatus paymentExpiresAt paymentHistory customer pricing items totalAmount inventoryDeductedAt inventoryRestoredAt')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json({
    ok: true,
    items: items.map(order => ({
      id: order.id,
      createdAt: order.createdAt,
      status: order.status,
      statusHistory: order.statusHistory || [],
      paymentMethod: order.paymentMethod || 'bank_transfer',
      paymentStatus: order.paymentStatus || 'pending',
      paymentExpiresAt: order.paymentExpiresAt || null,
      paymentHistory: order.paymentHistory || [],
      customer: {
        name: order.customer?.customerName || '',
        phone: order.customer?.phone || '',
        address: order.customer?.address || ''
      },
      items: (order.items || []).map(item => ({
        name: item.name,
        sku: item.sku,
        size: item.size,
        color: item.color,
        quantity: item.qty,
        unitPrice: item.price,
        subtotal: item.subtotal
      })),
      subtotal: order.pricing?.subtotal || 0,
      discountAmount: order.pricing?.discountAmount || 0,
      totalAmount: order.totalAmount,
      inventoryDeductedAt: order.inventoryDeductedAt || null,
      inventoryRestoredAt: order.inventoryRestoredAt || null
    }))
  });
}));

router.post('/orders/:id/status', requireRole('SUPER_ADMIN', 'ADMIN'), asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  const order = await purchaseService.transitionMongoOrder(
    String(req.params.id || ''),
    String(req.body.status || ''),
    'admin'
  );
  res.json({ ok: true, status: order.status });
}));

router.post('/orders/:id/payment', requireRole('SUPER_ADMIN', 'ADMIN'), asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  const result = await purchaseService.verifyMongoPayment(
    String(req.params.id || ''),
    String(req.body.status || ''),
    'admin'
  );
  if (result.expired) return res.status(409).json({ ok: false, message: 'Đã hết hạn thanh toán; tồn kho được hoàn lại.' });
  res.json({ ok: true, status: result.order.paymentStatus });
}));

router.post('/orders/:id/cancel', requireRole('SUPER_ADMIN', 'ADMIN'), asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  const order = await purchaseService.cancelMongoOrder(String(req.params.id || ''));
  res.json({ ok: true, status: order.status });
}));

// Customer Management APIs
router.get('/customers', requireRole('SUPER_ADMIN', 'ADMIN', 'STAFF'), asyncRoute(async (req, res) => {
  const query = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim();
  const type = String(req.query.type || 'all').trim();
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const result = await accountService.listCustomers({ query, status, type, page, perPage: 50 });
  res.json({ ok: true, ...result });
}));

router.post('/customers/:id/status', requireRole('SUPER_ADMIN', 'ADMIN'), asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  const customerId = req.params.id;
  const nextStatus = String(req.body.status || 'ACTIVE');
  const updated = await accountService.toggleCustomerStatus(customerId, nextStatus);
  if (!updated) return res.status(404).json({ ok: false, message: 'Không tìm thấy khách hàng.' });
  res.json({ ok: true, customer: updated });
}));

// Revenue Reports APIs
router.get('/reports', requireRole('SUPER_ADMIN', 'ADMIN'), asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  await purchaseService.expirePendingMongoOrders();

  const range = String(req.query.range || 'all').trim();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let filterStartDate = null;
  if (range === 'today') {
    filterStartDate = startOfToday;
  } else if (range === '7d') {
    filterStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === '30d') {
    filterStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const query = {};
  if (filterStartDate) {
    query.createdAt = { $gte: filterStartDate };
  }

  const allOrders = await Order.find(query).lean();

  let totalPaidRevenue = 0;
  let revenueToday = 0;
  let revenueThisMonth = 0;
  let paidOrderCount = 0;

  const paymentMethodMap = {
    bank_transfer: { method: 'bank_transfer', totalCount: 0, paidCount: 0, revenue: 0 },
    cod: { method: 'cod', totalCount: 0, paidCount: 0, revenue: 0 }
  };

  const statusMap = {};

  for (const order of allOrders) {
    const amount = Number(order.totalAmount || 0);
    const createdAt = new Date(order.createdAt);
    const pm = order.paymentMethod || 'bank_transfer';

    if (!paymentMethodMap[pm]) {
      paymentMethodMap[pm] = { method: pm, totalCount: 0, paidCount: 0, revenue: 0 };
    }
    paymentMethodMap[pm].totalCount += 1;

    if (!statusMap[order.status]) statusMap[order.status] = { status: order.status, count: 0, value: 0 };
    statusMap[order.status].count += 1;
    statusMap[order.status].value += amount;

    if (order.paymentStatus === 'paid') {
      totalPaidRevenue += amount;
      paidOrderCount += 1;
      paymentMethodMap[pm].paidCount += 1;
      paymentMethodMap[pm].revenue += amount;

      if (createdAt >= startOfToday) revenueToday += amount;
      if (createdAt >= startOfMonth) revenueThisMonth += amount;
    }
  }

  const aov = paidOrderCount > 0 ? Math.round(totalPaidRevenue / paidOrderCount) : 0;

  // Best sellers aggregation
  const matchFilter = { status: { $nin: ['cancelled', 'failed'] } };
  if (filterStartDate) matchFilter.createdAt = { $gte: filterStartDate };

  const bestSellersAgg = await Order.aggregate([
    { $match: matchFilter },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.productId',
        name: { $first: '$items.name' },
        sku: { $first: '$items.sku' },
        quantity: { $sum: '$items.qty' },
        revenue: { $sum: '$items.subtotal' }
      }
    },
    { $sort: { quantity: -1 } },
    { $limit: 10 }
  ]);

  res.json({
    ok: true,
    range,
    totalPaidRevenue,
    revenueToday,
    revenueThisMonth,
    paidOrderCount,
    totalOrders: allOrders.length,
    aov,
    paymentMethods: Object.values(paymentMethodMap).map(pm => ({
      ...pm,
      count: pm.paidCount // backwards compatibility for existing consumers
    })),
    orderStatuses: Object.values(statusMap),
    bestSellers: bestSellersAgg
  });
}));

// ==========================================
// ADMIN EXPORT CENTER ENDPOINTS
// ==========================================

router.get('/export/stats', requireAdmin, asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  const result = await get_eligible_guest_customers();
  res.json({ ok: true, summary: result.summary });
}));

router.get('/export/preview', requireAdmin, asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  const result = await get_eligible_guest_customers();
  res.json({
    ok: true,
    summary: result.summary,
    eligible: result.eligible.map(g => ({
      customerId: g.customerId,
      customerName: g.customerName,
      phone: g.phone,
      email: g.email,
      address: g.address,
      orderCount: g.orders.length,
      orderIds: g.relatedOrderIds,
      totalSpend: g.orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0)
    })),
    ineligible: result.ineligible.map(g => ({
      customerId: g.customerId,
      customerName: g.customerName,
      phone: g.phone,
      orderCount: g.orders.length,
      orderIds: g.relatedOrderIds,
      reason: g.reason
    }))
  });
}));

router.post('/export/generate', requireAdmin, requireRole('SUPER_ADMIN', 'ADMIN'), asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;

  const result = await get_eligible_guest_customers();
  const eligibleGuests = result.eligible;

  const jobId = `EXP_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  const generated = await generateGuestArchiveWorkbook(eligibleGuests, {
    jobId,
    adminEmail: req.session.admin.email,
    adminRole: req.session.admin.role
  });

  // Validate workbook integrity before saving
  const validation = await validateWorkbookBuffer(generated.buffer);

  // Ensure export directory
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  }

  const filePath = path.join(EXPORTS_DIR, generated.filename);
  fs.writeFileSync(filePath, generated.buffer);

  // Record export job in MongoDB Atlas
  const exportJob = new ExportJob({
    jobId,
    adminEmail: req.session.admin.email,
    adminId: req.session.admin.id,
    exportScope: 'ELIGIBLE_GUESTS_ONLY',
    customerCount: generated.customerCount,
    orderCount: generated.orderCount,
    itemCount: generated.itemCount,
    status: 'DOWNLOAD_READY',
    checksumSha256: generated.sha256,
    filename: generated.filename,
    filePath,
    fileSizeBytes: generated.buffer.length,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    validationLog: [
      `Workbook validated with sheets: ${validation.sheetNames.join(', ')}`,
      `Verified customer rows: ${validation.customersRows}, orders rows: ${validation.ordersRows}, item rows: ${validation.itemsRows}`,
      `SHA-256 Checksum: ${generated.sha256}`
    ]
  });

  await exportJob.save();

  res.json({
    ok: true,
    jobId,
    filename: generated.filename,
    downloadUrl: `/api/admin/export/${jobId}/download`,
    checksumSha256: generated.sha256,
    customerCount: generated.customerCount,
    orderCount: generated.orderCount,
    itemCount: generated.itemCount,
    fileSizeBytes: generated.buffer.length,
    createdAt: exportJob.createdAt
  });
}));

router.get('/export/:jobId/download', requireAdmin, asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  const jobId = String(req.params.jobId || '').trim();
  const job = await ExportJob.findOne({ jobId });
  if (!job) {
    return res.status(404).json({ ok: false, message: 'Phiên xuất dữ liệu không tồn tại.' });
  }

  if (!fs.existsSync(job.filePath)) {
    return res.status(404).json({ ok: false, message: 'Tệp xuất Excel đã hết hạn hoặc không còn trên máy chủ.' });
  }

  job.downloadCount += 1;
  job.downloadStatus = 'DOWNLOADED';
  job.downloadedAt = new Date();
  job.status = 'COMPLETED';
  await job.save();

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${job.filename}"`);
  res.setHeader('Content-Length', job.fileSizeBytes);

  const stream = fs.createReadStream(job.filePath);
  stream.pipe(res);
}));

router.get('/export/history', requireAdmin, asyncRoute(async (req, res) => {
  if (requireMongo(res)) return;
  const jobs = await ExportJob.find().sort({ createdAt: -1 }).limit(50).lean();
  res.json({ ok: true, jobs });
}));

module.exports = router;

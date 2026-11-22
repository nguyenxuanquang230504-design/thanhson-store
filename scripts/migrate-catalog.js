require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Category = require('../server/models/category');
const Product = require('../server/models/product');
const Order = require('../server/models/order');
const Customer = require('../server/models/customer');
const { slugify } = require('../server/lib/search-text');

const DATA_DIR = path.join(__dirname, '..', 'data');

async function migrateCatalog() {
  const uri = process.env.MONGODB_URI || process.env.LOCAL_MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required.');

  console.log('Connecting to MongoDB for catalog migration...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  try {
    // 1. Safe Backup of current state
    const backupDir = path.join(DATA_DIR, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup-${timestamp}.json`);

    const existingCategories = await Category.find().lean();
    const existingProducts = await Product.find().lean();
    const existingOrders = await Order.find().lean();
    const existingCustomers = await Customer.find().lean();

    fs.writeFileSync(backupPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      categoryCount: existingCategories.length,
      productCount: existingProducts.length,
      orderCount: existingOrders.length,
      customerCount: existingCustomers.length,
      categories: existingCategories,
      products: existingProducts,
      orders: existingOrders,
      customers: existingCustomers
    }, null, 2));
    console.log(`Pre-migration backup saved to ${backupPath}`);
    console.log(`Initial counts: ${existingCategories.length} categories, ${existingProducts.length} products, ${existingOrders.length} orders, ${existingCustomers.length} customers.`);

    // 2. Archive unrelated categories and ensure EXACTLY ONE active category: "Áo dài cách tân"
    await Category.updateMany(
      { slug: { $ne: 'ao-dai-cach-tan' }, status: { $ne: 'ARCHIVED' } },
      { $set: { status: 'ARCHIVED', updatedAt: new Date() } }
    );

    let activeCategory = await Category.findOne({ slug: 'ao-dai-cach-tan' });
    if (!activeCategory) {
      activeCategory = await Category.create({
        name: 'Áo dài cách tân',
        slug: 'ao-dai-cach-tan',
        description: 'Bộ sưu tập áo dài cách tân cao cấp Thanh Sơn Store. Tinh hoa truyền thống hòa quyện nét đẹp đương đại, tôn vinh vóc dáng người mặc.',
        image: '/images/item1.jpg',
        banner: '/images/banner.jpg',
        displayOrder: 1,
        status: 'PUBLISHED',
        seoTitle: 'Áo Dài Cách Tân Thanh Sơn — Tinh Tế & Hiện Đại',
        seoDescription: 'Bộ sưu tập Áo Dài Cách Tân độc quyền từ Thanh Sơn Store. Chất liệu lụa, gấm, tơ tằm thượng hạng, may đo chuẩn form dáng.'
      });
      console.log('Created single active category: "Áo dài cách tân"');
    } else {
      activeCategory.name = 'Áo dài cách tân';
      activeCategory.status = 'PUBLISHED';
      if (!activeCategory.description) {
        activeCategory.description = 'Bộ sưu tập áo dài cách tân cao cấp Thanh Sơn Store. Tinh hoa truyền thống hòa quyện nét đẹp đương đại.';
      }
      await activeCategory.save();
      console.log('Verified single active category: "Áo dài cách tân"');
    }

    // 3. Migrate and Classify existing catalog products
    const rawProducts = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'products.json'), 'utf8'));

    // Archive non-Ao Dai items: tsf-003 .. tsf-008
    const nonAoDaiIds = ['tsf-003', 'tsf-004', 'tsf-005', 'tsf-006', 'tsf-007', 'tsf-008'];
    for (const raw of rawProducts) {
      const code = String(raw.id).toUpperCase();
      let product = await Product.findOne({ productCode: code });
      if (!product) product = new Product({ productCode: code });

      if (nonAoDaiIds.includes(raw.id)) {
        // Archive unrelated products to preserve historical records safely
        Object.assign(product, {
          name: raw.name,
          productName: raw.name,
          slug: slugify(raw.id),
          productCode: code,
          sku: code,
          image: raw.image,
          price: Number(raw.price),
          originalPrice: Number(raw.price),
          stock: Number(raw.stock || 0),
          shortDescription: raw.desc || '',
          description: raw.desc || '',
          productStatus: 'ARCHIVED'
        });
        await product.save();
        console.log(`Archived unrelated product: ${raw.name} (${code})`);
      }
    }

    // 4. Seed and update valid ÁO DÀI CÁCH TÂN products
    const aoDaiCatalog = [
      {
        id: 'tsf-001',
        productCode: 'TSF-001',
        sku: 'TSF-AD-001',
        name: 'Áo dài cách tân hồng phấn thêu hoa',
        price: 390000,
        originalPrice: 450000,
        salePrice: 390000,
        image: '/images/item1.jpg',
        images: ['/images/item1.jpg'],
        material: 'Lụa Tơ Tằm',
        color: 'Hồng phấn',
        sizes: ['S', 'M', 'L', 'XL'],
        designStyle: 'Dáng suông trẻ trung',
        shortDescription: 'Áo dài cách tân màu hồng phấn dịu dàng, chất liệu lụa mềm mịn, thoáng mát, thêu hoa tay tinh xảo.',
        description: 'Mẫu áo dài cách tân mang phong cách thanh lịch, phù hợp cho dịp lễ Tết, dạo phố, chụp ảnh kỷ niệm và các sự kiện trang trọng. Đường may tỉ mỉ, form dáng chuẩn tôn đường nét duyên dáng của phụ nữ Việt Nam.',
        isFeatured: true,
        isNewArrival: true,
        variants: [
          { size: 'S', color: 'Hồng phấn', sku: 'TSF-AD-001-S', stock: 6, priceAdjustment: 0, available: true },
          { size: 'M', color: 'Hồng phấn', sku: 'TSF-AD-001-M', stock: 8, priceAdjustment: 0, available: true },
          { size: 'L', color: 'Hồng phấn', sku: 'TSF-AD-001-L', stock: 6, priceAdjustment: 0, available: true },
          { size: 'XL', color: 'Hồng phấn', sku: 'TSF-AD-001-XL', stock: 4, priceAdjustment: 0, available: true }
        ]
      },
      {
        id: 'tsf-002',
        productCode: 'TSF-002',
        sku: 'TSF-AD-002',
        name: 'Áo dài cách tân trắng ngọc gấm hoa',
        price: 420000,
        originalPrice: 490000,
        salePrice: 420000,
        image: '/images/item2.jpg',
        images: ['/images/item2.jpg'],
        material: 'Gấm Thượng Hải',
        color: 'Trắng ngọc',
        sizes: ['S', 'M', 'L', 'XL'],
        designStyle: 'Tay lỡ thanh lịch',
        shortDescription: 'Áo dài cách tân trắng ngọc dệt hoa chìm sang trọng, cổ giọt nước quý phái.',
        description: 'Chất vải gấm đứng form, bề mặt dệt hoa văn tinh tế óng ánh dưới ánh sáng. Tay lỡ hiện đại giúp cử động thoải mái suốt cả ngày dài.',
        isFeatured: true,
        isNewArrival: true,
        variants: [
          { size: 'S', color: 'Trắng ngọc', sku: 'TSF-AD-002-S', stock: 7, priceAdjustment: 0, available: true },
          { size: 'M', color: 'Trắng ngọc', sku: 'TSF-AD-002-M', stock: 9, priceAdjustment: 0, available: true },
          { size: 'L', color: 'Trắng ngọc', sku: 'TSF-AD-002-L', stock: 5, priceAdjustment: 0, available: true },
          { size: 'XL', color: 'Trắng ngọc', sku: 'TSF-AD-002-XL', stock: 4, priceAdjustment: 0, available: true }
        ]
      },
      {
        id: 'tsf-009',
        productCode: 'TSF-009',
        sku: 'TSF-AD-009',
        name: 'Áo dài cách tân đỏ thêu hoa sen chỉ vàng',
        price: 550000,
        originalPrice: 650000,
        salePrice: 490000,
        image: '/images/banner.jpg',
        images: ['/images/banner.jpg'],
        material: 'Gấm Thêu',
        color: 'Đỏ tươi',
        sizes: ['S', 'M', 'L', 'XL'],
        designStyle: 'Cổ vuông cách điệu',
        shortDescription: 'Sắc đỏ may mắn kết hợp họa tiết hoa sen thêu thủ công sắc nét bằng chỉ kim tuyến vàng.',
        description: 'Mẫu áo dài được yêu thích hàng đầu cho các dịp cưới hỏi, đón năm mới và sự kiện quan trọng. Tà áo 2 lớp mềm mại bay bổng.',
        isFeatured: true,
        isNewArrival: true,
        variants: [
          { size: 'S', color: 'Đỏ tươi', sku: 'TSF-AD-009-S', stock: 5, priceAdjustment: 0, available: true },
          { size: 'M', color: 'Đỏ tươi', sku: 'TSF-AD-009-M', stock: 10, priceAdjustment: 0, available: true },
          { size: 'L', color: 'Đỏ tươi', sku: 'TSF-AD-009-L', stock: 8, priceAdjustment: 0, available: true },
          { size: 'XL', color: 'Đỏ tươi', sku: 'TSF-AD-009-XL', stock: 3, priceAdjustment: 0, available: true }
        ]
      },
      {
        id: 'tsf-010',
        productCode: 'TSF-010',
        sku: 'TSF-AD-010',
        name: 'Áo dài cách tân vàng hoàng yến tay bồng',
        price: 520000,
        originalPrice: 580000,
        salePrice: 520000,
        image: '/images/item1.jpg',
        images: ['/images/item1.jpg'],
        material: 'Tơ Tằm Vân Mây',
        color: 'Vàng hoàng yến',
        sizes: ['S', 'M', 'L', 'XL'],
        designStyle: 'Tay bồng hiện đại',
        shortDescription: 'Màu vàng rực rỡ tươi mới, chi tiết tay bồng tạo điểm nhấn kiêu sa và thanh thoát.',
        description: 'Thiết kế trẻ trung phá cách với tay phồng bồng bềnh, che khuyết điểm bắp tay tối đa. Dáng áo suông nhẹ mang lại cảm giác dễ chịu khi dạo phố.',
        isFeatured: true,
        isNewArrival: false,
        variants: [
          { size: 'S', color: 'Vàng hoàng yến', sku: 'TSF-AD-010-S', stock: 6, priceAdjustment: 0, available: true },
          { size: 'M', color: 'Vàng hoàng yến', sku: 'TSF-AD-010-M', stock: 7, priceAdjustment: 0, available: true },
          { size: 'L', color: 'Vàng hoàng yến', sku: 'TSF-AD-010-L', stock: 5, priceAdjustment: 0, available: true },
          { size: 'XL', color: 'Vàng hoàng yến', sku: 'TSF-AD-010-XL', stock: 2, priceAdjustment: 0, available: true }
        ]
      },
      {
        id: 'tsf-011',
        productCode: 'TSF-011',
        sku: 'TSF-AD-011',
        name: 'Áo dài cách tân xanh ngọc bích đính ngọc trai',
        price: 620000,
        originalPrice: 720000,
        salePrice: 580000,
        image: '/images/item2.jpg',
        images: ['/images/item2.jpg'],
        material: 'Lụa Satin',
        color: 'Xanh ngọc',
        sizes: ['S', 'M', 'L'],
        designStyle: 'Cổ tròn đính ngọc',
        shortDescription: 'Gam màu xanh ngọc dịu mát kết hợp viền cổ đính hạt ngọc trai thủ công tinh xảo.',
        description: 'Chất vải lụa satin thượng hạng với độ bóng nhẹ óng ả. Mẫu áo mang đến thần thái tao nhã, sang trọng cho quý cô hiện đại.',
        isFeatured: false,
        isNewArrival: true,
        variants: [
          { size: 'S', color: 'Xanh ngọc', sku: 'TSF-AD-011-S', stock: 4, priceAdjustment: 0, available: true },
          { size: 'M', color: 'Xanh ngọc', sku: 'TSF-AD-011-M', stock: 8, priceAdjustment: 0, available: true },
          { size: 'L', color: 'Xanh ngọc', sku: 'TSF-AD-011-L', stock: 3, priceAdjustment: 0, available: true }
        ]
      },
      {
        id: 'tsf-012',
        productCode: 'TSF-012',
        sku: 'TSF-AD-012',
        name: 'Áo dài cách tân hoa nhí mùa xuân',
        price: 450000,
        originalPrice: 480000,
        salePrice: null,
        image: '/images/item1.jpg',
        images: ['/images/item1.jpg'],
        material: 'Chiffon Lụa',
        color: 'Kem hoa nhí',
        sizes: ['S', 'M', 'L', 'XL'],
        designStyle: 'Dáng suông trẻ trung',
        shortDescription: 'Họa tiết hoa nhí vintage nhẹ nhàng trên nền vải chiffon lụa êm ái, bồng bềnh.',
        description: 'Mẫu áo dài cách tân phong cách dạo phố cực kỳ đáng yêu và nữ tính. Phù hợp phối cùng quần ống suông lụa hoặc chân váy xòe.',
        isFeatured: false,
        isNewArrival: true,
        variants: [
          { size: 'S', color: 'Kem hoa nhí', sku: 'TSF-AD-012-S', stock: 8, priceAdjustment: 0, available: true },
          { size: 'M', color: 'Kem hoa nhí', sku: 'TSF-AD-012-M', stock: 12, priceAdjustment: 0, available: true },
          { size: 'L', color: 'Kem hoa nhí', sku: 'TSF-AD-012-L', stock: 7, priceAdjustment: 0, available: true },
          { size: 'XL', color: 'Kem hoa nhí', sku: 'TSF-AD-012-XL', stock: 5, priceAdjustment: 0, available: true }
        ]
      },
      {
        id: 'tsf-013',
        productCode: 'TSF-013',
        sku: 'TSF-AD-013',
        name: 'Áo dài cách tân nhung đỏ quý phái tà kép',
        price: 690000,
        originalPrice: 790000,
        salePrice: 650000,
        image: '/images/banner.jpg',
        images: ['/images/banner.jpg'],
        material: 'Nhung Then',
        color: 'Đỏ rượu',
        sizes: ['S', 'M', 'L', 'XL'],
        designStyle: 'Tà kép sang trọng',
        shortDescription: 'Vải nhung mềm mướt không nhăn, phối tà kép organza mang lại vẻ đẹp quyền quý.',
        description: 'Tuyệt phẩm cho mùa lễ hội và tiệc tối sang trọng. Chất nhung co giãn nhẹ, giữ ấm vừa phải và tôn dáng hoàn hảo.',
        isFeatured: true,
        isNewArrival: false,
        variants: [
          { size: 'S', color: 'Đỏ rượu', sku: 'TSF-AD-013-S', stock: 4, priceAdjustment: 0, available: true },
          { size: 'M', color: 'Đỏ rượu', sku: 'TSF-AD-013-M', stock: 6, priceAdjustment: 0, available: true },
          { size: 'L', color: 'Đỏ rượu', sku: 'TSF-AD-013-L', stock: 5, priceAdjustment: 0, available: true },
          { size: 'XL', color: 'Đỏ rượu', sku: 'TSF-AD-013-XL', stock: 2, priceAdjustment: 0, available: true }
        ]
      }
    ];

    const savedActiveProducts = [];
    for (const item of aoDaiCatalog) {
      let product = await Product.findOne({ productCode: item.productCode });
      if (!product) product = new Product();

      const totalStock = item.variants.reduce((sum, v) => sum + v.stock, 0);
      Object.assign(product, {
        name: item.name,
        productName: item.name,
        slug: slugify(item.name),
        productCode: item.productCode,
        sku: item.sku,
        category: activeCategory._id,
        categorySlug: activeCategory.slug,
        categoryName: activeCategory.name,
        image: item.image,
        images: item.images,
        price: item.price,
        originalPrice: item.originalPrice,
        salePrice: item.salePrice,
        stock: totalStock,
        material: item.material,
        colors: [item.color],
        sizes: item.sizes,
        designStyle: item.designStyle,
        shortDescription: item.shortDescription,
        description: item.description,
        isFeatured: item.isFeatured,
        isNewArrival: item.isNewArrival,
        variants: item.variants,
        productStatus: 'PUBLISHED',
        seoTitle: `${item.name} | Thanh Sơn Store`,
        seoDescription: item.shortDescription
      });
      await product.save();
      savedActiveProducts.push(product);
      console.log(`Saved active Áo dài: ${product.name} (${product.productCode}) - Stock: ${product.stock}`);
    }

    // 5. Migrate Customers from users.json to MongoDB Customer collection
    const usersFile = path.join(DATA_DIR, 'users.json');
    if (fs.existsSync(usersFile)) {
      const rawUsers = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
      for (const raw of rawUsers) {
        const username = String(raw.username || '').toLowerCase();
        let customer = await Customer.findOne({ username });
        if (!customer) {
          const passwordHash = raw.passwordHash || (raw.password ? await bcrypt.hash(raw.password, 12) : await bcrypt.hash('12345678', 12));
          customer = await Customer.create({
            fullName: raw.fullName || 'Khách hàng',
            phone: raw.phone && raw.phone.length > 8 ? raw.phone : '0912345678',
            username,
            passwordHash,
            address: raw.address || 'Hà Nội',
            accountStatus: 'ACTIVE',
            wishlist: Array.isArray(raw.wishlist) ? raw.wishlist : []
          });
          console.log(`Migrated Customer to MongoDB: ${customer.username} (${customer.fullName})`);
        }
      }
    }

    // 6. Migrate Historical Orders from orders.json to MongoDB Order collection
    const ordersFile = path.join(DATA_DIR, 'orders.json');
    if (fs.existsSync(ordersFile)) {
      const rawOrders = JSON.parse(fs.readFileSync(ordersFile, 'utf8'));
      const productMap = new Map(savedActiveProducts.map(p => [p.productCode, p]));
      const defaultProduct = savedActiveProducts[0];

      for (const raw of rawOrders) {
        const existingOrder = await Order.findOne({ id: raw.id });
        if (!existingOrder) {
          const items = (raw.items || []).map(item => {
            const matchedProduct = productMap.get(String(item.id || item.productId || '').toUpperCase()) || defaultProduct;
            return {
              productId: matchedProduct._id,
              variantId: null,
              sku: item.sku || matchedProduct.sku,
              size: item.size || 'M',
              color: item.color || matchedProduct.colors[0] || 'Hồng phấn',
              name: item.name || matchedProduct.name,
              image: item.image || matchedProduct.image,
              qty: Number(item.qty || 1),
              price: Number(item.price || matchedProduct.price),
              subtotal: Number(item.subtotal || item.price || matchedProduct.price)
            };
          });

          await Order.create({
            id: raw.id,
            idempotencyKey: raw.idempotencyKey || `migrated-${raw.id}`,
            idempotencyFingerprint: `migrated-${raw.id}`,
            ownerKeyHash: `migrated-${raw.id}`,
            guestAccessTokenHash: '',
            customerId: raw.customerId || '',
            createdAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
            status: raw.status || 'pending',
            statusHistory: [{ status: raw.status || 'pending', changedAt: raw.createdAt ? new Date(raw.createdAt) : new Date(), actor: 'system' }],
            paymentMethod: raw.paymentMethod || 'bank_transfer',
            paymentStatus: raw.paymentStatus || 'pending',
            paymentExpiresAt: raw.paymentExpiresAt ? new Date(raw.paymentExpiresAt) : null,
            paymentHistory: [{ status: raw.paymentStatus || 'pending', changedAt: raw.createdAt ? new Date(raw.createdAt) : new Date(), actor: 'system' }],
            inventoryDeductedAt: raw.inventoryDeductedAt ? new Date(raw.inventoryDeductedAt) : new Date(),
            inventoryRestoredAt: null,
            customer: {
              customerName: raw.customer?.customerName || 'Khách hàng',
              phone: raw.customer?.phone || '0900000000',
              address: raw.customer?.address || 'Hà Nội',
              notes: raw.customer?.notes || ''
            },
            user: raw.user || null,
            pricing: {
              subtotal: raw.pricing?.subtotal || raw.totalAmount || 390000,
              discountRate: raw.pricing?.discountRate || 0,
              discountAmount: raw.pricing?.discountAmount || 0,
              shippingFee: raw.pricing?.shippingFee || 0,
              totalAmount: raw.totalAmount || 390000
            },
            items,
            totalAmount: raw.totalAmount || 390000,
            payment: raw.payment || {
              bankId: '970422',
              accountNo: '0011101884099',
              accountName: 'DINH THI NGOC MAI',
              transferNote: `${raw.id}`
            },
            paymentQrUrl: raw.paymentQrUrl || ''
          });
          console.log(`Migrated historical order: ${raw.id}`);
        }
      }
    }

    // Final verification counts
    const finalCategories = await Category.find().lean();
    const finalProducts = await Product.find().lean();
    const activeProducts = await Product.find({ productStatus: 'PUBLISHED' }).lean();
    const archivedProducts = await Product.find({ productStatus: 'ARCHIVED' }).lean();
    const finalOrders = await Order.find().lean();
    const finalCustomers = await Customer.find().lean();

    console.log('\n--- MIGRATION SUMMARY ---');
    console.log(`Total Categories: ${finalCategories.length} (Active: ${finalCategories.filter(c => c.status === 'PUBLISHED').length}, Archived: ${finalCategories.filter(c => c.status === 'ARCHIVED').length})`);
    console.log(`Active Category Name: "${finalCategories.find(c => c.status === 'PUBLISHED')?.name}" (slug: ${finalCategories.find(c => c.status === 'PUBLISHED')?.slug})`);
    console.log(`Total Products in MongoDB: ${finalProducts.length}`);
    console.log(`  - Active (PUBLISHED) Áo dài: ${activeProducts.length}`);
    console.log(`  - Archived (Unrelated items safely preserved): ${archivedProducts.length}`);
    console.log(`Total Orders in MongoDB: ${finalOrders.length}`);
    console.log(`Total Customers in MongoDB: ${finalCustomers.length}`);
    console.log('-------------------------\n');

  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
}

migrateCatalog().catch(error => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});

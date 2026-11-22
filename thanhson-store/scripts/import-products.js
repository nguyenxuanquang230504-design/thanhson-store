require('dotenv').config();
const mongoose = require('mongoose');
const productRepository = require('../data/product-repository');
const Category = require('../server/models/category');
const Product = require('../server/models/product');
const { slugify } = require('../server/lib/search-text');

async function importProducts() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    const source = productRepository.findAll();
    for (const product of source) {
      const categorySlug = slugify(product.category || 'other');
      let category = await Category.findOne({ slug: categorySlug });
      if (!category) {
        category = await Category.create({
          name: product.category || 'Other',
          slug: categorySlug,
          status: 'PUBLISHED'
        });
      }

      const productCode = String(product.id).toUpperCase();
      const item = await Product.findOne({ productCode });
      const target = item || new Product();
      Object.assign(target, {
        name: product.name,
        productName: product.name,
        slug: slugify(product.id),
        productCode,
        category: category._id,
        categorySlug,
        categoryName: category.name,
        image: product.image,
        price: Number(product.price),
        originalPrice: Number(product.price),
        stock: Number(product.stock || 0),
        shortDescription: product.desc || '',
        description: product.desc || '',
        productStatus: 'PUBLISHED'
      });
      await target.save();
    }
    console.log(`Imported ${source.length} products from the existing local catalog.`);
  } finally {
    await mongoose.disconnect();
  }
}

importProducts().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

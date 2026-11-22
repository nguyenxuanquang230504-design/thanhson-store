const mongoose = require('mongoose');
const { searchTokens, slugify } = require('../lib/search-text');

const variantSchema = new mongoose.Schema({
  size: { type: String, trim: true, default: '' },
  color: { type: String, trim: true, default: '' },
  sku: { type: String, trim: true, uppercase: true, default: '' },
  stock: { type: Number, min: 0, default: 0, validate: Number.isInteger },
  priceAdjustment: { type: Number, default: 0 },
  available: { type: Boolean, default: true }
}, { _id: true });

const productSchema = new mongoose.Schema({
  productName: { type: String, trim: true, maxlength: 200 },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  slug: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  productCode: { type: String, trim: true, uppercase: true, default: '' },
  sku: { type: String, trim: true, uppercase: true, default: '' },
  description: { type: String, default: '', maxlength: 10000 },
  shortDescription: { type: String, default: '', maxlength: 500 },
  desc: { type: String, default: '' },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  categorySlug: { type: String, default: '' },
  categoryName: { type: String, default: '' },
  brand: { type: String, default: '', trim: true },
  genderTarget: { type: String, default: '' },
  image: { type: String, default: '' },
  images: { type: [String], default: [] },
  price: { type: Number, min: 0, required: true },
  originalPrice: { type: Number, min: 0, default: 0 },
  salePrice: { type: Number, min: 0, default: null },
  stock: { type: Number, min: 0, default: 0, validate: Number.isInteger },
  sizes: { type: [String], default: [] },
  colors: { type: [String], default: [] },
  material: { type: String, default: '' },
  designStyle: { type: String, default: '', trim: true },
  subcategory: { type: String, default: '' },
  tags: { type: [String], default: [] },
  variants: { type: [variantSchema], default: [] },
  productStatus: { type: String, enum: ['DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED', 'INACTIVE'], default: 'PUBLISHED' },
  isFeatured: { type: Boolean, default: false },
  isNewArrival: { type: Boolean, default: false },
  seoTitle: { type: String, default: '', maxlength: 160 },
  seoDescription: { type: String, default: '', maxlength: 320 },
  searchTokens: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { strict: true });

productSchema.pre('validate', function prepareSearch() {
  this.productName = this.productName || this.name;
  this.name = this.name || this.productName;
  this.desc = this.desc || this.shortDescription || this.description;
  this.slug = this.slug || slugify(this.name);
  this.originalPrice = this.originalPrice || this.price;
  if (this.variants.length) this.stock = this.variants.reduce((total, variant) => total + variant.stock, 0);
  this.updatedAt = new Date();
  this.searchTokens = searchTokens([
    this.name, this.productName, this.productCode, this.sku, this.categorySlug,
    this.categoryName, this.brand, this.genderTarget, this.subcategory,
    this.description, this.shortDescription, this.desc, this.material, this.designStyle,
    ...this.tags, ...this.sizes, ...this.colors,
    ...this.variants.flatMap(variant => [variant.size, variant.color, variant.sku])
  ]);
});
productSchema.index({ searchTokens: 1, productStatus: 1 });
productSchema.index({ category: 1, productStatus: 1, price: 1 });
productSchema.index({ productStatus: 1, category: 1, salePrice: 1 });
productSchema.index({ productStatus: 1, category: 1, price: 1 });
productSchema.index({ sku: 1 }, { sparse: true });
productSchema.index({ productCode: 1 }, { sparse: true });

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);

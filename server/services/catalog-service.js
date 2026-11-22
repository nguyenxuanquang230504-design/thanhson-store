const Product = require('../models/product');
const Category = require('../models/category');
const productRepository = require('../../data/product-repository');
const { isMongoConnected } = require('../lib/mongo');
const { normalizeSearchText, searchTokens } = require('../lib/search-text');
const { nodeEnv } = require('../config');

function sellingPrice(product) {
  return Number(product.salePrice != null ? product.salePrice : product.price || product.sellingPrice || 0);
}

function priceStep(maximum) {
  const roughStep = Math.max(1000, Number(maximum || 0) / 100);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  return [1, 2, 5, 10].map(value => value * magnitude).find(step => step >= roughStep) || 10 * magnitude;
}

let warnedEmptyDevelopmentCatalog = false;

async function useJsonCatalogFallback() {
  if (!isMongoConnected()) return true;
  if (nodeEnv !== 'development') return false;
  const hasPublishedProducts = await Product.exists({ productStatus: 'PUBLISHED' });
  if (hasPublishedProducts) return false;
  if (!warnedEmptyDevelopmentCatalog) {
    console.warn('MongoDB has no published products; using the local JSON catalog for development preview.');
    warnedEmptyDevelopmentCatalog = true;
  }
  return true;
}

function publicProduct(product) {
  const value = typeof product.toObject === 'function' ? product.toObject() : product;
  return {
    ...value,
    id: String(value._id || value.id),
    name: value.name || value.productName,
    desc: value.desc || value.shortDescription || value.description || '',
    category: value.categorySlug || (value.category && value.category.slug) || value.categoryName || value.category || '',
    image: value.image || (Array.isArray(value.images) ? value.images[0] : '') || '',
    price: sellingPrice(value)
  };
}

function makeMongoFilter(options) {
  const filter = { productStatus: 'PUBLISHED' };
  filter.$and = [];
  const tokens = searchTokens([options.query || '']);
  if (tokens.length) filter.searchTokens = { $all: tokens.slice(0, 8) };

  if (options.category) {
    filter.$and.push({ $or: [
      { categorySlug: options.category.toLowerCase() },
      { categoryName: new RegExp(`^${escapeRegex(options.category)}$`, 'i') }
    ] });
  }
  const min = Number(options.minPrice);
  const max = Number(options.maxPrice);
  const priceRange = {};
  if (options.minPrice !== '' && Number.isFinite(min) && min > 0) priceRange.$gte = min;
  if (options.maxPrice !== '' && Number.isFinite(max) && max >= 0) priceRange.$lte = max;
  if (Object.keys(priceRange).length) {
    filter.$and.push({ $or: [
      { salePrice: { $ne: null, ...priceRange } },
      { salePrice: null, price: priceRange }
    ] });
  }
  if (options.size && options.color) {
    filter.$and.push({ $or: [
      { variants: { $elemMatch: { size: options.size, color: options.color } } },
      { sizes: options.size, colors: options.color }
    ] });
  } else {
    if (options.size) filter.$and.push({ $or: [{ sizes: options.size }, { 'variants.size': options.size }] });
    if (options.color) filter.$and.push({ $or: [{ colors: options.color }, { 'variants.color': options.color }] });
  }
  if (options.material) filter.material = new RegExp(`^${escapeRegex(options.material)}$`, 'i');
  if (options.designStyle) filter.designStyle = new RegExp(`^${escapeRegex(options.designStyle)}$`, 'i');
  if (options.sale === 'true' || options.sale === true) filter.salePrice = { $ne: null };
  if (options.collection === 'true' || options.collection === true) filter.isFeatured = true;
  if (options.isNewArrival === 'true' || options.isNewArrival === true) filter.isNewArrival = true;
  if (options.brand) filter.brand = new RegExp(`^${escapeRegex(options.brand)}$`, 'i');
  if (options.availableOnly === 'true') filter.$and.push({ $or: [
    { variants: { $size: 0 }, stock: { $gt: 0 } },
    { variants: { $elemMatch: { stock: { $gt: 0 }, available: { $ne: false } } } }
  ] });
  if (!filter.$and.length) delete filter.$and;
  return filter;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rank(product, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;
  const sku = normalizeSearchText(product.sku);
  const code = normalizeSearchText(product.productCode);
  const name = normalizeSearchText(product.name);
  if (sku === normalizedQuery) return 0;
  if (code === normalizedQuery) return 1;
  if (name === normalizedQuery) return 2;
  if (name.includes(normalizedQuery)) return 3;
  if (normalizeSearchText(product.category).includes(normalizedQuery)) return 4;
  if ([product.brand, product.material, ...(product.tags || [])].some(value => normalizeSearchText(value).includes(normalizedQuery))) return 5;
  return 6;
}

async function listProducts(options = {}) {
  const normalized = { sort: 'newest', page: '1', perPage: 12, ...options };
  if (await useJsonCatalogFallback()) {
    const result = productRepository.list(normalized);
    return { ...result, products: result.products.map(publicProduct) };
  }

  const filter = makeMongoFilter(normalized);
  const total = await Product.countDocuments(filter);
  const pageSize = Math.max(1, Math.min(48, Number.parseInt(normalized.perPage, 10) || 12));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number.parseInt(normalized.page, 10) || 1), totalPages);
  const sortMap = {
    newest: { createdAt: -1 },
    'price-asc': { _customerPrice: 1, createdAt: -1 },
    'price-desc': { _customerPrice: -1, createdAt: -1 },
    name: { name: 1 }
  };
  const docs = await Product.aggregate([
    { $match: filter },
    { $addFields: { _customerPrice: { $ifNull: ['$salePrice', '$price'] } } },
    { $sort: sortMap[normalized.sort] || sortMap.newest },
    { $skip: (page - 1) * pageSize },
    { $limit: pageSize },
    { $project: { _customerPrice: 0 } }
  ]);
  await Product.populate(docs, { path: 'category', select: 'name slug' });
  let products = docs.map(publicProduct);
  if (normalized.query) products.sort((a, b) => rank(a, normalized.query) - rank(b, normalized.query));
  return { products, pagination: { page, perPage: pageSize, total, totalPages } };
}

async function getSuggestions(query, limit = 7) {
  const normalizedQuery = String(query || '').trim().slice(0, 100);
  if (!normalizedQuery) return [];
  const result = await listProducts({ query: normalizedQuery, perPage: limit });
  return result.products.slice(0, limit).map(product => ({
    id: product.id,
    name: product.name,
    image: product.image,
    price: product.price,
    category: product.category,
    available: Number(product.stock || 0) > 0
  }));
}

async function findProduct(identifier) {
  if (await useJsonCatalogFallback()) {
    const product = productRepository.findById(identifier);
    return product ? publicProduct(product) : null;
  }
  const query = mongooseIdentifier(identifier)
    ? { _id: identifier, productStatus: 'PUBLISHED' }
    : { slug: identifier, productStatus: 'PUBLISHED' };
  const product = await Product.findOne(query).populate('category', 'name slug');
  return product ? publicProduct(product) : null;
}

async function homeProducts() {
  if (await useJsonCatalogFallback()) {
    const products = productRepository.findAll().map(publicProduct);
    return {
      featured: products.slice(0, 4),
      newArrivals: products.slice(0, 4),
      promotions: products.slice(0, 4),
      bestSellers: products.slice(0, 4)
    };
  }
  const docs = await Product.find({ productStatus: 'PUBLISHED' })
    .sort({ createdAt: -1 })
    .limit(30)
    .populate('category', 'name slug')
    .lean();
  const products = docs.map(publicProduct);

  const featured = products.filter(p => p.isFeatured);
  const newArrivals = products.filter(p => p.isNewArrival);
  const promotions = products.filter(p => p.salePrice != null && p.salePrice < p.originalPrice);

  return {
    featured: featured.length ? featured.slice(0, 4) : products.slice(0, 4),
    newArrivals: newArrivals.length ? newArrivals.slice(0, 4) : products.slice(0, 4),
    promotions: promotions.length ? promotions.slice(0, 4) : products.slice(0, 4),
    bestSellers: products.slice(0, 4)
  };
}

async function getPriceBounds(options = {}) {
  let maximum = 0;
  if (await useJsonCatalogFallback()) {
    const products = productRepository.findAll({ category: options.category || '' });
    maximum = products.reduce((value, product) => Math.max(value, sellingPrice(product)), 0);
  } else {
    const match = { productStatus: 'PUBLISHED' };
    if (options.category) {
      const category = await Category.findOne({ slug: String(options.category).toLowerCase(), status: 'PUBLISHED' }).select('_id').lean();
      match.category = category ? category._id : { $exists: false };
    }
    const [bounds] = await Product.aggregate([
      { $match: match },
      { $project: { customerPrice: { $ifNull: ['$salePrice', '$price'] } } },
      { $group: { _id: null, maximum: { $max: '$customerPrice' } } }
    ]);
    maximum = Number(bounds?.maximum || 0);
  }
  maximum = Math.ceil(maximum);
  return { min: 0, max: maximum, step: priceStep(maximum) };
}

function mongooseIdentifier(value) {
  return /^[a-f\d]{24}$/i.test(String(value));
}

module.exports = { listProducts, getSuggestions, publicProduct, makeMongoFilter, findProduct, homeProducts, getPriceBounds, sellingPrice, priceStep };

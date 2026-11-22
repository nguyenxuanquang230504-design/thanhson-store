const fs = require('fs');
const path = require('path');
const { normalizeSearchText } = require('../server/lib/search-text');
const InventoryError = require('../server/lib/inventory-error');

const PRODUCTS_FILE = path.join(__dirname, 'products.json');

function readProducts() {
  try {
    const raw = fs.readFileSync(PRODUCTS_FILE, 'utf8');
    const products = JSON.parse(raw);
    return Array.isArray(products) ? products : [];
  } catch (error) {
    return [];
  }
}

function findAll({ category = '' } = {}) {
  const products = readProducts();
  const normalizedCategory = normalizeSearchText(category);
  if (!normalizedCategory) return products;
  return products.filter(product => normalizeSearchText(product.category) === normalizedCategory);
}

function findById(id) {
  return readProducts().find(product => product.id === id) || null;
}

function search({ query = '', category = '', limit } = {}) {
  const keywords = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  let products = findAll({ category });

  if (keywords.length) {
    products = products.filter(product => {
      const searchableText = normalizeSearchText([
        product.name, product.productName, product.desc, product.description,
        product.category, product.subcategory, product.brand, product.productCode,
        product.sku, product.material, ...(product.tags || []),
        ...(product.colors || []), ...(product.sizes || [])
      ].join(' '));
      return keywords.every(keyword => searchableText.includes(keyword));
    }).sort((a, b) => {
      const q = normalizeSearchText(query);
      const score = product => {
        if (normalizeSearchText(product.sku) === q) return 0;
        if (normalizeSearchText(product.productCode) === q) return 1;
        if (normalizeSearchText(product.name || product.productName) === q) return 2;
        if (normalizeSearchText(product.name || product.productName).includes(q)) return 3;
        if (normalizeSearchText(product.category).includes(q)) return 4;
        return 5;
      };
      return score(a) - score(b);
    });
  }

  const parsedLimit = Number(limit);
  if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
    products = products.slice(0, parsedLimit);
  }

  return products;
}

function list({
  query = '', category = '', sort = 'newest', minPrice = '', maxPrice = '',
  size = '', color = '', material = '', brand = '', availableOnly = '',
  page = 1, perPage = 12
} = {}) {
  let products = search({ query, category });
  const min = Number(minPrice);
  const max = Number(maxPrice);
  const sellingPrice = product => Number(product.salePrice != null ? product.salePrice : product.price || 0);
  if (Number.isFinite(min) && min > 0) products = products.filter(product => sellingPrice(product) >= min);
  if (Number.isFinite(max) && max >= 0 && maxPrice !== '') products = products.filter(product => sellingPrice(product) <= max);
  if (size) products = products.filter(product => [...(product.sizes || []), ...(product.variants || []).map(variant => variant.size)].some(value => normalizeSearchText(value) === normalizeSearchText(size)));
  if (color) products = products.filter(product => [...(product.colors || []), ...(product.variants || []).map(variant => variant.color)].some(value => normalizeSearchText(value) === normalizeSearchText(color)));
  if (material) products = products.filter(product => normalizeSearchText(product.material) === normalizeSearchText(material));
  if (brand) products = products.filter(product => normalizeSearchText(product.brand) === normalizeSearchText(brand));
  if (availableOnly === true || availableOnly === 'true') products = products.filter(product => Number(product.stock || 0) > 0);

  if (sort === 'price-asc') products.sort((a, b) => sellingPrice(a) - sellingPrice(b));
  if (sort === 'price-desc') products.sort((a, b) => sellingPrice(b) - sellingPrice(a));
  if (sort === 'name') products.sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));

  const currentPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const pageSize = Math.max(1, Math.min(48, Number.parseInt(perPage, 10) || 12));
  const total = products.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    products: products.slice(start, start + pageSize),
    pagination: { page: safePage, perPage: pageSize, total, totalPages }
  };
}

function applyStockChanges(products, lines, direction) {
  if (direction !== -1 && direction !== 1) throw new TypeError('Stock direction must be -1 or 1.');
  for (const line of lines) {
    const qty = Number(line.qty);
    if (!Number.isSafeInteger(qty) || qty < 1) throw new InventoryError('Số lượng đặt không hợp lệ.', 400);
    const product = products.find(item => item.id === line.id);
    if (!product) throw new InventoryError('Sản phẩm không còn tồn tại.', 409);
    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (variants.length) {
      const variant = variants.find(item => String(item._id || item.id) === String(line.variantId || ''));
      if (!variant) throw new InventoryError('Phân loại sản phẩm không hợp lệ hoặc đã thay đổi.');
      if (variant.available === false) throw new InventoryError('Phân loại sản phẩm hiện không bán.');
      if (direction < 0 && Number(variant.stock || 0) < qty) throw new InventoryError(`Chỉ còn ${Number(variant.stock || 0)} sản phẩm có thể chọn.`);
      variant.stock = Number(variant.stock || 0) + direction * qty;
      product.stock = variants.reduce((total, item) => total + Number(item.stock || 0), 0);
    } else {
      if (line.variantId) throw new InventoryError('Sản phẩm không có phân loại được chọn.');
      if (direction < 0 && Number(product.stock || 0) < qty) throw new InventoryError(`Chỉ còn ${Number(product.stock || 0)} sản phẩm.`);
      product.stock = Number(product.stock || 0) + direction * qty;
    }
  }
  return products;
}

function adjustStock(lines, direction) {
  const products = applyStockChanges(readProducts(), lines, direction);
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf8');
}

module.exports = {
  findAll,
  findById,
  search,
  list,
  applyStockChanges,
  adjustStock
};

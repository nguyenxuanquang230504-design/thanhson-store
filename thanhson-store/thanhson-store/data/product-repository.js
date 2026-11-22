const fs = require('fs');
const path = require('path');

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

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('vi');
}

function findAll({ category = '' } = {}) {
  const products = readProducts();
  const normalizedCategory = normalize(category);
  if (!normalizedCategory) return products;
  return products.filter(product => normalize(product.category) === normalizedCategory);
}

function findById(id) {
  return readProducts().find(product => product.id === id) || null;
}

function search({ query = '', category = '', limit } = {}) {
  const keyword = normalize(query);
  let products = findAll({ category });

  if (keyword) {
    products = products.filter(product => {
      const searchableText = [product.name, product.desc, product.category]
        .map(normalize)
        .join(' ');
      return searchableText.includes(keyword);
    });
  }

  const parsedLimit = Number(limit);
  if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
    products = products.slice(0, parsedLimit);
  }

  return products;
}

module.exports = {
  findAll,
  findById,
  search
};

const productRepository = require('../../data/product-repository');

function getCart(req) {
  return Array.isArray(req.session.cart) ? req.session.cart : [];
}

function getWishlist(req) {
  return Array.isArray(req.session.wishlist) ? req.session.wishlist : [];
}

function getCartSummary(req) {
  const items = getCart(req)
    .map(item => {
      const product = productRepository.findById(item.id);
      return {
        ...item,
        product,
        subtotal: product ? product.price * item.qty : 0
      };
    })
    .filter(item => item.product);

  const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
  return { items, totalQty, totalAmount };
}

module.exports = { getCart, getWishlist, getCartSummary };

const { getCart, getWishlist } = require('../services/cart-service');

function viewLocals(req, res, next) {
  const cart = getCart(req);
  const wishlist = getWishlist(req);
  res.locals.brand = 'Thanh Sơn Fashion';
  res.locals.currentUser = req.session.user || null;
  res.locals.badges = {
    cart: cart.reduce((sum, item) => sum + Number(item.qty || 0), 0),
    wishlist: wishlist.length
  };
  next();
}

module.exports = viewLocals;

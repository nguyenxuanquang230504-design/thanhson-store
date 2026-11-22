const catalogService = require('./catalog-service');

function getCart(req) {
  return Array.isArray(req.session.cart) ? req.session.cart : [];
}

function getWishlist(req) {
  if (req.session.user && Array.isArray(req.session.user.wishlist)) return req.session.user.wishlist;
  return Array.isArray(req.session.wishlist) ? req.session.wishlist : [];
}

async function getCartSummary(req) {
  const resolved = await Promise.all(getCart(req).map(async item => {
    const product = await catalogService.findProduct(item.id);
    if (!product) return null;
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variant = item.variantId ? variants.find(value => String(value._id) === String(item.variantId)) : null;
    const invalidVariant = variants.length > 0 && !variant;
    const availableStock = variant
      ? variant.available === false ? 0 : Number(variant.stock || 0)
      : variants.length ? 0 : Number(product.stock || 0);
    const basePrice = product.salePrice != null ? Number(product.salePrice) : Number(product.price);
    const price = basePrice + Number(variant?.priceAdjustment || 0);
    return {
      ...item,
      product,
      variant: variant || null,
      invalidVariant,
      availableStock,
      price,
      subtotal: price * Number(item.qty || 0)
    };
  }));
  const items = resolved.filter(Boolean);

  const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
  return { items, totalQty, totalAmount };
}

module.exports = { getCart, getWishlist, getCartSummary };

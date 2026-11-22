const crypto = require('crypto');

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function createOrderContext({ rawKey, ownerIdentity, customerId, guestAccessToken, cartItems, customer, discountRate, paymentMethod }) {
  const key = String(rawKey || '').trim().slice(0, 100) || crypto.randomUUID();
  const idempotencyKey = `v2-${digest(`${ownerIdentity}\0${key}`)}`;
  const cart = cartItems
    .map(item => ({
      id: String(item.id),
      variantId: String(item.variantId || ''),
      qty: Number(item.qty)
    }))
    .sort((left, right) => `${left.id}:${left.variantId}`.localeCompare(`${right.id}:${right.variantId}`));
  const fingerprint = digest(JSON.stringify({ cart, customer, discountRate, paymentMethod }));

  return {
    idempotencyKey,
    idempotencyFingerprint: fingerprint,
    ownerKeyHash: digest(ownerIdentity),
    customerId: customerId || '',
    guestAccessTokenHash: guestAccessToken ? digest(guestAccessToken) : ''
  };
}

function hashAccessToken(token) {
  return token ? digest(token) : '';
}

module.exports = { createOrderContext, hashAccessToken };

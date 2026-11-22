const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');
const { createOrderContext } = require('../server/lib/order-security');
const { toCustomerOrder } = require('../server/services/order-view');

const request = {
  rawKey: 'same-client-key',
  cartItems: [{ id: 'product-a', variantId: 'size-m', qty: 2 }],
  customer: { customerName: 'Khách hàng', phone: '0900000000', address: 'Địa chỉ' },
  discountRate: 0,
  paymentMethod: 'bank_transfer'
};

test('idempotency keys are scoped to their owner', () => {
  const firstOwner = createOrderContext({ ...request, ownerIdentity: 'guest:session-a' });
  const secondOwner = createOrderContext({ ...request, ownerIdentity: 'guest:session-b' });
  const retry = createOrderContext({ ...request, ownerIdentity: 'guest:session-a' });

  assert.notEqual(firstOwner.idempotencyKey, secondOwner.idempotencyKey);
  assert.equal(firstOwner.idempotencyKey, retry.idempotencyKey);
  assert.equal(firstOwner.idempotencyFingerprint, retry.idempotencyFingerprint);
});

test('idempotency fingerprint changes when checkout payload changes', () => {
  const original = createOrderContext({ ...request, ownerIdentity: 'user:customer-a' });
  const changed = createOrderContext({
    ...request,
    ownerIdentity: 'user:customer-a',
    customer: { ...request.customer, address: 'Địa chỉ khác' }
  });

  assert.equal(original.idempotencyKey, changed.idempotencyKey);
  assert.notEqual(original.idempotencyFingerprint, changed.idempotencyFingerprint);
});

test('customer order DTO exposes only a whitelist and does not claim pending payment succeeded', () => {
  const order = {
    id: 'HD-123',
    status: 'pending',
    paymentMethod: 'bank_transfer',
    paymentStatus: 'pending',
    paymentExpiresAt: '2026-10-15T10:00:00.000Z',
    createdAt: '2026-10-14T10:00:00.000Z',
    customer: { customerName: 'Nguyễn An', phone: '0900000000', address: 'Địa chỉ', notes: '' },
    items: [{ name: 'Áo dài', sku: 'TS-1', size: 'M', color: 'Hồng', qty: 1, price: 500000, subtotal: 500000 }],
    pricing: { subtotal: 500000, discountAmount: 0, shippingFee: 0 },
    totalAmount: 500000,
    payment: { bankId: 'bank', accountNo: '123', accountName: 'SHOP', transferNote: 'HD-123 0900000000' },
    idempotencyKey: 'internal-key',
    idempotencyFingerprint: 'internal-fingerprint',
    ownerKeyHash: 'owner-hash',
    guestAccessTokenHash: 'access-hash',
    inventoryDeductedAt: '2026-10-14T10:00:00.000Z',
    user: { username: 'private-user' }
  };
  const dto = toCustomerOrder(order, { paymentQrUrl: 'https://example.test/qr.png' });
  const serialized = JSON.stringify(dto);

  assert.equal(dto.payment.statusLabel, 'Chờ thanh toán');
  assert.match(dto.confirmationMessage, /Vui lòng thanh toán/);
  assert.doesNotMatch(dto.confirmationMessage, /đã được xác nhận thanh toán/);
  for (const privateField of ['idempotencyKey', 'idempotencyFingerprint', 'ownerKeyHash', 'guestAccessTokenHash', 'inventoryDeductedAt', 'private-user']) {
    assert.equal(serialized.includes(privateField), false);
  }
  assert.equal(dto.timeline[dto.timeline.length - 1].current, true);
});

test('customer order DTO reports payment confirmation only for recorded paid status', () => {
  const dto = toCustomerOrder({
    id: 'HD-456',
    status: 'confirmed',
    paymentMethod: 'bank_transfer',
    paymentStatus: 'paid',
    createdAt: '2026-10-14T10:00:00.000Z',
    statusHistory: [{ status: 'pending', changedAt: '2026-10-14T10:00:00.000Z' }, { status: 'confirmed', changedAt: '2026-10-14T11:00:00.000Z' }],
    paymentHistory: [{ status: 'pending', changedAt: '2026-10-14T10:00:00.000Z' }, { status: 'paid', changedAt: '2026-10-14T10:30:00.000Z' }],
    customer: {},
    items: [],
    pricing: {},
    totalAmount: 0
  });

  assert.match(dto.confirmationMessage, /đã được xác nhận/);
  assert.equal(dto.payment.statusLabel, 'Đã thanh toán');
  assert.equal(dto.payment.qrUrl, '');
});

test('cancelled orders do not show a live payment QR or request payment', () => {
  const dto = toCustomerOrder({
    id: 'HD-789',
    status: 'cancelled',
    paymentMethod: 'bank_transfer',
    paymentStatus: 'cancelled',
    createdAt: '2026-10-14T10:00:00.000Z',
    customer: {},
    items: [],
    pricing: {},
    totalAmount: 0,
    payment: { bankId: 'bank', accountNo: '123', accountName: 'SHOP', transferNote: 'HD-789' }
  }, { paymentQrUrl: 'https://example.test/qr.png' });

  assert.equal(dto.payment.statusLabel, 'Đã hủy');
  assert.equal(dto.payment.qrUrl, '');
  assert.match(dto.confirmationMessage, /đã được hủy/);
});

test('order confirmation page renders customer-safe fields instead of raw order JSON', async () => {
  const dto = toCustomerOrder({
    id: 'HD-TEST',
    status: 'pending',
    paymentMethod: 'bank_transfer',
    paymentStatus: 'pending',
    createdAt: '2026-10-14T10:00:00.000Z',
    customer: { customerName: 'Khách an toàn', phone: '0900000000', address: 'Địa chỉ', notes: '' },
    items: [{ name: 'Áo dài test', qty: 1, price: 250000, subtotal: 250000 }],
    pricing: { subtotal: 250000, discountAmount: 0 },
    totalAmount: 250000,
    payment: { bankId: 'bank', accountNo: '123', accountName: 'SHOP', transferNote: 'HD-TEST 0900000000' },
    idempotencyKey: 'secret-key',
    guestAccessTokenHash: 'secret-token-hash'
  }, { paymentQrUrl: 'https://example.test/qr.png' });
  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'order-detail.ejs'), {
    order: dto,
    badges: { cart: 0, wishlist: 0 },
    currentUser: null
  });

  assert.match(html, /Đơn hàng đã được tiếp nhận/);
  assert.match(html, /Áo dài test/);
  assert.doesNotMatch(html, /secret-key|secret-token-hash|JSON\.stringify/);
});

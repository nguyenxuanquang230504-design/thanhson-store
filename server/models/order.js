const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sku: { type: String, default: '' },
  size: { type: String, default: '' },
  color: { type: String, default: '' },
  name: { type: String, required: true },
  image: { type: String, default: '' },
  qty: { type: Number, required: true, min: 1, validate: Number.isInteger },
  price: { type: Number, required: true, min: 0 },
  subtotal: { type: Number, required: true, min: 0 }
}, { _id: false });

const orderHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  changedAt: { type: Date, required: true, default: Date.now },
  actor: { type: String, enum: ['system', 'admin'], default: 'system' }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  idempotencyKey: { type: String, required: true, unique: true },
  idempotencyFingerprint: { type: String, default: '' },
  ownerKeyHash: { type: String, default: '' },
  guestAccessTokenHash: { type: String, default: '' },
  customerId: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'failed', 'completed'], default: 'pending' },
  statusHistory: { type: [orderHistorySchema], default: [] },
  paymentMethod: { type: String, enum: ['bank_transfer', 'cod'], default: 'bank_transfer' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'unpaid', 'failed', 'expired', 'cancelled'], default: 'pending' },
  paymentExpiresAt: { type: Date, default: null },
  paymentHistory: { type: [orderHistorySchema], default: [] },
  inventoryDeductedAt: { type: Date, required: true },
  inventoryRestoredAt: { type: Date, default: null },
  customer: {
    customerName: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    notes: { type: String, default: '' }
  },
  user: { type: mongoose.Schema.Types.Mixed, default: null },
  pricing: {
    subtotal: { type: Number, required: true },
    discountRate: { type: Number, default: 0 },
    discountAmount: { type: Number, required: true },
    shippingFee: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true }
  },
  items: { type: [orderItemSchema], required: true },
  totalAmount: { type: Number, required: true },
  payment: {
    bankId: { type: String, default: '' },
    accountNo: { type: String, default: '' },
    accountName: { type: String, default: '' },
    transferNote: { type: String, default: '' }
  },
  paymentQrUrl: { type: String, default: '' }
}, { minimize: false });

orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ guestAccessTokenHash: 1 });
orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ paymentMethod: 1, paymentStatus: 1, paymentExpiresAt: 1, status: 1 });

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);

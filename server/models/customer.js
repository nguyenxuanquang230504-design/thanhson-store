const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, required: true, unique: true, trim: true },
  email: { type: String, sparse: true, lowercase: true, trim: true, default: null },
  username: { type: String, unique: true, lowercase: true, trim: true, required: true },
  passwordHash: { type: String, required: true },
  address: { type: String, default: '', trim: true, maxlength: 500 },
  accountStatus: { type: String, enum: ['ACTIVE', 'LOCKED', 'DEACTIVATED'], default: 'ACTIVE' },
  wishlist: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: null }
}, { timestamps: true });

customerSchema.index({ accountStatus: 1, createdAt: -1 });

module.exports = mongoose.models.Customer || mongoose.model('Customer', customerSchema);

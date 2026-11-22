const mongoose = require('mongoose');
const { slugify } = require('../lib/search-text');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 140 },
  description: { type: String, default: '', maxlength: 2000 },
  image: { type: String, default: '' },
  banner: { type: String, default: '' },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  displayOrder: { type: Number, default: 0 },
  status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT' },
  seoTitle: { type: String, default: '', maxlength: 160 },
  seoDescription: { type: String, default: '', maxlength: 320 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

categorySchema.pre('validate', function setSlug() {
  if (!this.slug && this.name) this.slug = slugify(this.name);
});
categorySchema.index({ status: 1, displayOrder: 1, name: 1 });

module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);

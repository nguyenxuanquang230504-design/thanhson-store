const mongoose = require('mongoose');

const exportJobSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true, index: true },
  adminEmail: { type: String, required: true },
  adminId: { type: String, required: true },
  exportScope: { type: String, default: 'ELIGIBLE_GUESTS_ONLY' },
  customerCount: { type: Number, default: 0 },
  orderCount: { type: Number, default: 0 },
  itemCount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['READY', 'EXPORTING', 'VALIDATING', 'DOWNLOAD_READY', 'DOWNLOAD_INITIATED', 'COMPLETED', 'FAILED'],
    default: 'READY'
  },
  checksumSha256: { type: String, default: '' },
  filename: { type: String, required: true },
  filePath: { type: String, required: true },
  fileSizeBytes: { type: Number, default: 0 },
  downloadCount: { type: Number, default: 0 },
  downloadStatus: { type: String, enum: ['PENDING', 'DOWNLOADED', 'EXPIRED'], default: 'PENDING' },
  downloadedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
  errorMessage: { type: String, default: '' },
  validationLog: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

exportJobSchema.index({ createdAt: -1 });

module.exports = mongoose.models.ExportJob || mongoose.model('ExportJob', exportJobSchema);

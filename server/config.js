require('dotenv').config();

const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

module.exports = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  mongoDbUri: process.env.MONGODB_URI || '',
  localMongoUri: process.env.LOCAL_MONGODB_URI || '',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@thanhson.local',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  cloudinaryUrl: process.env.CLOUDINARY_URL || '',
  dataDir: DATA_DIR,
  usersFile: path.join(DATA_DIR, 'users.json'),
  ordersFile: path.join(DATA_DIR, 'orders.json'),
  memberDiscountRate: 0.15,
  lowStockThreshold: Number.parseInt(process.env.LOW_STOCK_THRESHOLD, 10) || 10,
  veryLowStockThreshold: Number.parseInt(process.env.VERY_LOW_STOCK_THRESHOLD, 10) || 5,
  bankTransferExpiryHours: Number.parseInt(process.env.BANK_TRANSFER_EXPIRY_HOURS, 10) || 24,
  payment: {
    bankId: process.env.PAYMENT_BANK_ID || '970422',
    accountNo: process.env.PAYMENT_ACCOUNT_NO || '0011101884099',
    accountName: process.env.PAYMENT_ACCOUNT_NAME || 'DINH THI NGOC MAI'
  }
};

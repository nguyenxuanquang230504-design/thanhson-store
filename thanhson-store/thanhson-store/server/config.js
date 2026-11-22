const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

module.exports = {
  port: Number(process.env.PORT) || 3000,
  dataDir: DATA_DIR,
  usersFile: path.join(DATA_DIR, 'users.json'),
  ordersFile: path.join(DATA_DIR, 'orders.json'),
  memberDiscountRate: 0.15,
  payment: {
    bankId: process.env.PAYMENT_BANK_ID || '970422',
    accountNo: process.env.PAYMENT_ACCOUNT_NO || '0123456789',
    accountName: process.env.PAYMENT_ACCOUNT_NAME || 'THANH SON FASHION'
  }
};

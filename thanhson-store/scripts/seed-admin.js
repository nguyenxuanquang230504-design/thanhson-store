require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const AdminUser = require('../server/models/admin-user');

async function seed() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Admin seeding is allowed only when NODE_ENV=development.');
  }
  const uri = process.env.LOCAL_MONGODB_URI || '';
  if (!uri) throw new Error('Set LOCAL_MONGODB_URI to a local MongoDB instance.');
  const parsed = new URL(uri);
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    throw new Error('Refusing to seed a remote database. LOCAL_MONGODB_URI must use localhost.');
  }
  const email = String(process.env.ADMIN_EMAIL || 'admin@thanhson.local').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe_TS2026!';
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    const existing = await AdminUser.findOne({ email }).select('_id').lean();
    if (existing) {
      console.log('SUPER_ADMIN already exists; credentials were not changed.');
      return;
    }
    await AdminUser.create({
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'SUPER_ADMIN',
      accountStatus: 'ACTIVE',
      mustChangePassword: true
    });
    console.log('Local SUPER_ADMIN created. Sign in at http://localhost:3000/admin/login and change the password.');
    console.log(`Email: ${email}`);
    console.log(`Temporary password: ${password}`);
  } finally {
    await mongoose.disconnect();
  }
}

seed().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

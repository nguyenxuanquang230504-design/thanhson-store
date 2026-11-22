require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const AdminUser = require('../server/models/admin-user');

async function seed() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Admin seeding is allowed only when NODE_ENV=development.');
  }
  const uri = process.env.MONGODB_URI || process.env.LOCAL_MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI or LOCAL_MONGODB_URI is required.');

  const email = String(process.env.ADMIN_EMAIL || 'admin@thanhson.local').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'ThanhSon@2026Admin!';
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    const existing = await AdminUser.findOne({ email }).lean();
    if (existing) {
      console.log(`SUPER_ADMIN (${email}) already exists in MongoDB.`);
      console.log(`Role: ${existing.role}, Status: ${existing.accountStatus}`);
      return;
    }
    await AdminUser.create({
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'SUPER_ADMIN',
      accountStatus: 'ACTIVE',
      mustChangePassword: false
    });
    console.log('Local/Dev SUPER_ADMIN created successfully in MongoDB.');
    console.log(`Login URL: http://localhost:3000/admin/login`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
  } finally {
    await mongoose.disconnect();
  }
}

seed().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

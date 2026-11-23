const { readJson, writeJson } = require('../lib/json-store');
const { usersFile } = require('../config');
const config = require('../config');
const { connectMongo, isMongoConnected } = require('../lib/mongo');
const Customer = require('../models/customer');
const AdminUser = require('../models/admin-user');
const Order = require('../models/order');
const bcrypt = require('bcryptjs');

function findUserLocal(username) {
  const normalized = String(username || '').trim().toLowerCase();
  return readJson(usersFile, []).find(user => user.username.toLowerCase() === normalized);
}

async function authenticate(username, password) {
  const normalized = String(username || '').trim().toLowerCase();

  if (isMongoConnected()) {
    // 1. Check if an Admin user is logging in
    const adminConditions = [{ email: normalized }];
    if (normalized === 'admin') {
      adminConditions.push({ email: 'admin@thanhson.local' });
    }
    const adminUser = await AdminUser.findOne({ $or: adminConditions, accountStatus: 'ACTIVE' });
    if (adminUser) {
      const valid = await bcrypt.compare(password, adminUser.passwordHash);
      if (!valid) {
        return { ok: false, status: 401, message: 'Sai mật khẩu quản trị viên.' };
      }
      adminUser.lastLoginAt = new Date();
      await adminUser.save();
      return {
        ok: true,
        isAdmin: true,
        redirect: adminUser.mustChangePassword ? '/admin/change-password' : '/admin',
        adminSession: {
          id: String(adminUser._id),
          email: adminUser.email,
          role: adminUser.role,
          mustChangePassword: adminUser.mustChangePassword
        }
      };
    }

    // 2. Find customer by username, phone, or email
    const customer = await Customer.findOne({
      $or: [
        { username: normalized },
        { phone: normalized },
        { email: normalized }
      ]
    });

    if (!customer) {
      return { ok: false, status: 404, message: 'Tài khoản chưa tồn tại. Vui lòng đăng ký trước.' };
    }
    if (customer.accountStatus === 'LOCKED') {
      return { ok: false, status: 403, message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ shop.' };
    }
    const valid = await bcrypt.compare(password, customer.passwordHash);
    if (!valid) return { ok: false, status: 401, message: 'Sai mật khẩu.' };

    customer.lastLoginAt = new Date();
    await customer.save();

    return {
      ok: true,
      user: {
        id: String(customer._id),
        _id: String(customer._id),
        username: customer.username,
        fullName: customer.fullName || customer.username,
        phone: customer.phone || '',
        email: customer.email || '',
        address: customer.address || '',
        wishlist: Array.isArray(customer.wishlist) ? customer.wishlist : []
      }
    };
  }

  // Local JSON Fallback
  const user = findUserLocal(normalized);
  if (!user) return { ok: false, status: 404, message: 'Tài khoản chưa tồn tại. Vui lòng đăng ký trước.' };
  let valid;
  if (typeof user.passwordHash === 'string') {
    valid = bcrypt.compareSync(password, user.passwordHash);
  } else {
    valid = user.password === password;
  }
  if (!valid) return { ok: false, status: 401, message: 'Sai mật khẩu.' };

  if (!user.passwordHash) {
    const users = readJson(usersFile, []);
    const index = users.findIndex(item => item.id === user.id);
    if (index >= 0) {
      users[index].passwordHash = bcrypt.hashSync(password, 12);
      delete users[index].password;
      writeJson(usersFile, users);
    }
  }

  return {
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName || user.username,
      phone: user.phone || '',
      email: user.email || '',
      address: user.address || '',
      wishlist: Array.isArray(user.wishlist) ? user.wishlist : []
    }
  };
}

async function registerUser({ username, password, fullName, phone, email = '', address = '' }) {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const cleanPhone = String(phone || '').trim().replace(/\s/g, '');
  const cleanEmail = String(email || '').trim().toLowerCase() || null;

  if (isMongoConnected()) {
    const existingUsername = await Customer.findOne({ username: normalizedUsername });
    if (existingUsername) {
      return { ok: false, status: 409, message: 'Tên đăng nhập đã tồn tại.' };
    }
    const existingPhone = await Customer.findOne({ phone: cleanPhone });
    if (existingPhone) {
      return { ok: false, status: 409, message: 'Số điện thoại này đã được đăng ký tài khoản.' };
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const customer = await Customer.create({
      fullName: String(fullName || '').trim(),
      phone: cleanPhone,
      email: cleanEmail,
      username: normalizedUsername,
      passwordHash,
      address: String(address || '').trim(),
      accountStatus: 'ACTIVE',
      wishlist: []
    });

    return {
      ok: true,
      user: {
        id: String(customer._id),
        username: customer.username,
        fullName: customer.fullName,
        phone: customer.phone
      }
    };
  }

  // Local JSON Fallback
  const users = readJson(usersFile, []);
  if (users.some(user => user.username.toLowerCase() === normalizedUsername)) {
    return { ok: false, status: 409, message: 'Tên đăng nhập đã tồn tại.' };
  }

  const user = {
    id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    username: normalizedUsername,
    passwordHash: bcrypt.hashSync(password, 12),
    fullName,
    phone: cleanPhone,
    email: cleanEmail || '',
    address: String(address || '').trim(),
    wishlist: [],
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeJson(usersFile, users);
  return { ok: true, user: { id: user.id, username: user.username, fullName: user.fullName, phone: user.phone } };
}

async function updateWishlist(username, wishlist) {
  const normalized = String(username || '').trim().toLowerCase();
  const cleanWishlist = [...new Set((wishlist || []).map(String))];

  if (isMongoConnected()) {
    await Customer.updateOne({ username: normalized }, { $set: { wishlist: cleanWishlist, updatedAt: new Date() } });
    return true;
  }

  const users = readJson(usersFile, []);
  const user = users.find(item => item.username.toLowerCase() === normalized);
  if (!user) return false;
  user.wishlist = cleanWishlist;
  writeJson(usersFile, users);
  return true;
}

async function getCustomerById(id) {
  if (isMongoConnected()) {
    return Customer.findById(id).select('-passwordHash').lean();
  }
  return readJson(usersFile, []).find(u => String(u.id) === String(id)) || null;
}

async function updateProfile(id, { fullName, phone, address, email }) {
  if (isMongoConnected()) {
    const update = {};
    if (fullName) update.fullName = String(fullName).trim();
    if (phone) update.phone = String(phone).trim();
    if (address !== undefined) update.address = String(address).trim();
    if (email !== undefined) update.email = String(email).trim().toLowerCase() || null;
    update.updatedAt = new Date();

    const customer = await Customer.findByIdAndUpdate(id, { $set: update }, { new: true }).select('-passwordHash').lean();
    return customer;
  }

  const users = readJson(usersFile, []);
  const index = users.findIndex(u => String(u.id) === String(id));
  if (index === -1) return null;
  if (fullName) users[index].fullName = String(fullName).trim();
  if (phone) users[index].phone = String(phone).trim();
  if (address !== undefined) users[index].address = String(address).trim();
  if (email !== undefined) users[index].email = String(email).trim().toLowerCase();
  writeJson(usersFile, users);
  return users[index];
}

async function listCustomers({ query = '', page = 1, perPage = 50, status = '', type = 'all' } = {}) {
  if (!isMongoConnected() && config.mongoDbUri) {
    try {
      await connectMongo(config.mongoDbUri);
    } catch (_) {}
  }

  if (!isMongoConnected()) {
    let items = readJson(usersFile, []).map(u => ({
      id: u.id,
      _id: u.id,
      username: u.username,
      fullName: u.fullName || u.username,
      phone: u.phone || '',
      email: u.email || '',
      address: u.address || '',
      accountStatus: 'ACTIVE',
      customerType: 'REGISTERED',
      isGuest: false,
      orderCount: 0,
      totalSpent: 0,
      createdAt: u.createdAt || new Date()
    }));
    if (query) {
      const q = query.toLowerCase();
      items = items.filter(u => (u.fullName && u.fullName.toLowerCase().includes(q)) || (u.phone && u.phone.includes(q)) || (u.username && u.username.toLowerCase().includes(q)));
    }
    return { items, pagination: { total: items.length, page: 1, totalPages: 1, perPage } };
  }

  const registeredFilter = {};
  if (status) registeredFilter.accountStatus = status;
  if (query) {
    const regex = new RegExp(String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    registeredFilter.$or = [{ fullName: regex }, { phone: regex }, { username: regex }, { email: regex }];
  }

  let registeredList = [];
  if (type === 'all' || type === 'registered') {
    const rawCustomers = await Customer.find(registeredFilter).select('-passwordHash').sort({ createdAt: -1 }).lean();
    const customerIds = rawCustomers.map(c => String(c._id));
    const orderStats = await Order.aggregate([
      { $match: { customerId: { $in: customerIds } } },
      { $group: { _id: '$customerId', orderCount: { $sum: 1 }, totalSpent: { $sum: '$totalAmount' } } }
    ]);
    const statsMap = new Map(orderStats.map(s => [String(s._id), s]));

    registeredList = rawCustomers.map(c => ({
      ...c,
      id: String(c._id),
      customerType: 'REGISTERED',
      isGuest: false,
      orderCount: statsMap.get(String(c._id))?.orderCount || 0,
      totalSpent: statsMap.get(String(c._id))?.totalSpent || 0
    }));
  }

  let guestList = [];
  if (type === 'all' || type === 'guest') {
    // Group all guest orders
    const guestOrders = await Order.find({ customerId: { $in: [null, ''] } }).sort({ createdAt: -1 }).lean();
    const guestMap = new Map();
    for (const ord of guestOrders) {
      const phone = String(ord.customer?.phone || '').trim();
      const name = String(ord.customer?.customerName || 'Khách vãng lai').trim();
      const addr = String(ord.customer?.address || '').trim();
      const key = phone || `order:${ord.id}`;

      if (!guestMap.has(key)) {
        guestMap.set(key, {
          id: `guest-${ord.id}`,
          _id: `guest-${ord.id}`,
          username: phone ? `khach_${phone.slice(-4)}` : 'khach_vang_lai',
          fullName: name,
          phone: phone,
          email: '',
          address: addr,
          accountStatus: 'ACTIVE',
          customerType: 'GUEST',
          isGuest: true,
          orderCount: 1,
          totalSpent: Number(ord.totalAmount || 0),
          createdAt: ord.createdAt || new Date()
        });
      } else {
        const item = guestMap.get(key);
        item.orderCount += 1;
        item.totalSpent += Number(ord.totalAmount || 0);
        if (!item.address && addr) item.address = addr;
      }
    }

    guestList = Array.from(guestMap.values());
    if (status && status !== 'ACTIVE') {
      guestList = []; // Guest customers are considered ACTIVE
    }
    if (query) {
      const q = query.toLowerCase();
      guestList = guestList.filter(g => (g.fullName && g.fullName.toLowerCase().includes(q)) || (g.phone && g.phone.includes(q)));
    }
  }

  const combined = [...registeredList, ...guestList].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const currentPage = Math.max(1, Number(page) || 1);
  const limit = Math.max(1, Math.min(100, Number(perPage) || 50));
  const total = combined.length;
  const skip = (currentPage - 1) * limit;
  const paginatedItems = combined.slice(skip, skip + limit);

  return {
    items: paginatedItems,
    pagination: {
      total,
      page: currentPage,
      perPage: limit,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  };
}

async function toggleCustomerStatus(id, newStatus) {
  if (!['ACTIVE', 'LOCKED', 'DEACTIVATED'].includes(newStatus)) {
    throw new Error('Trạng thái không hợp lệ.');
  }
  if (isMongoConnected()) {
    const customer = await Customer.findByIdAndUpdate(id, { $set: { accountStatus: newStatus, updatedAt: new Date() } }, { new: true }).select('-passwordHash').lean();
    return customer;
  }
  return null;
}

module.exports = {
  authenticate,
  registerUser,
  updateWishlist,
  getCustomerById,
  updateProfile,
  listCustomers,
  toggleCustomerStatus
};

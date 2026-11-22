const { readJson, writeJson } = require('../lib/json-store');
const { usersFile } = require('../config');
const bcrypt = require('bcryptjs');

function findUser(username) {
  const normalized = String(username || '').trim().toLowerCase();
  return readJson(usersFile, []).find(user => user.username.toLowerCase() === normalized);
}

function authenticate(username, password) {
  const user = findUser(username);
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
      wishlist: Array.isArray(user.wishlist) ? user.wishlist : []
    }
  };
}

function registerUser({ username, password, fullName, phone }) {
  const users = readJson(usersFile, []);
  if (users.some(user => user.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, status: 409, message: 'Tên đăng nhập đã tồn tại.' };
  }

  const user = {
    id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    username,
    passwordHash: bcrypt.hashSync(password, 12),
    fullName,
    phone,
    wishlist: [],
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeJson(usersFile, users);
  return { ok: true };
}

function updateWishlist(username, wishlist) {
  const users = readJson(usersFile, []);
  const user = users.find(item => item.username.toLowerCase() === String(username || '').toLowerCase());
  if (!user) return false;
  user.wishlist = [...new Set(wishlist.map(String))];
  writeJson(usersFile, users);
  return true;
}

module.exports = { authenticate, registerUser, updateWishlist };

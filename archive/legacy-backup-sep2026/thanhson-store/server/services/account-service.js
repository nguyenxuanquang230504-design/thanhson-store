const { readJson, writeJson } = require('../lib/json-store');
const { usersFile } = require('../config');

function findUser(username) {
  const normalized = String(username || '').trim().toLowerCase();
  return readJson(usersFile, []).find(user => user.username.toLowerCase() === normalized);
}

function authenticate(username, password) {
  const user = findUser(username);
  if (!user) return { ok: false, status: 404, message: 'Tài khoản chưa tồn tại. Vui lòng đăng ký trước.' };
  if (user.password !== password) return { ok: false, status: 401, message: 'Sai mật khẩu.' };

  return {
    ok: true,
    user: {
      username: user.username,
      fullName: user.fullName || user.username,
      phone: user.phone || ''
    }
  };
}

function registerUser({ username, password, fullName, phone }) {
  const users = readJson(usersFile, []);
  if (users.some(user => user.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, status: 409, message: 'Tên đăng nhập đã tồn tại.' };
  }

  const user = {
    id: Date.now(),
    username,
    password,
    fullName,
    phone,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeJson(usersFile, users);
  return { ok: true };
}

module.exports = { authenticate, registerUser };

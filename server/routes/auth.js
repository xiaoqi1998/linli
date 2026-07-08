const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error, now } = require('../helpers');
const { generateToken } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

/**
 * POST /api/v1/auth/register
 * Web 端注册: 手机号 + 密码
 * Body: { phone, password, nickName? }
 */
router.post('/register', (req, res) => {
  const { phone, password, nickName } = req.body;

  if (!phone || !password) {
    return error(res, '手机号和密码不能为空', 400);
  }

  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return error(res, '手机号格式不正确', 400);
  }

  if (password.length < 6) {
    return error(res, '密码至少 6 位', 400);
  }

  // 检查手机号是否已注册
  const existing = db.prepare('SELECT id FROM user WHERE phone = ?').get(phone);
  if (existing) {
    return error(res, '该手机号已注册', 409);
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(nickName || phone.slice(-4))}`;

  const result = db.prepare(`
    INSERT INTO user (phone, password_hash, nick_name, avatar_url, source, status)
    VALUES (?, ?, ?, ?, 'search', 1)
  `).run(phone, passwordHash, nickName || ('用户' + phone.slice(-4)), avatarUrl);

  const userId = result.lastInsertRowid;
  const token = generateToken(userId, 'user');

  return success(res, {
    token,
    userId,
    nickName: nickName || ('用户' + phone.slice(-4)),
    avatarUrl,
    phone,
    memberLevel: 1,
    points: 0,
  }, '注册成功');
});

/**
 * POST /api/v1/auth/login
 * Web 端登录: 手机号 + 密码
 * Body: { phone, password }
 */
router.post('/login', (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return error(res, '手机号和密码不能为空', 400);
  }

  const user = db.prepare(`
    SELECT id, nick_name, avatar_url, phone, password_hash, member_level, points, status
    FROM user WHERE phone = ?
  `).get(phone);

  if (!user) {
    return error(res, '手机号未注册', 404);
  }

  if (user.status !== 1) {
    return error(res, '账号已被禁用', 403);
  }

  if (!user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
    return error(res, '手机号或密码错误', 401);
  }

  // 更新最后登录时间
  db.prepare('UPDATE user SET last_login_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?')
    .run(user.id);

  const token = generateToken(user.id, 'user');

  return success(res, {
    token,
    userId: user.id,
    nickName: user.nick_name,
    avatarUrl: user.avatar_url,
    phone: user.phone,
    memberLevel: user.member_level,
    points: user.points,
  }, '登录成功');
});

/**
 * POST /api/v1/auth/login-guest
 * Demo 快速体验登录 (免注册)
 * Body: { role?: 'user' | 'rider' | 'leader' }
 */
router.post('/rider-login', (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return error(res, '手机号和密码不能为空', 400);
  }

  const rider = db.prepare(`
    SELECT id, name, phone, password_hash, status
    FROM rider WHERE phone = ?
  `).get(phone);

  if (!rider) {
    return error(res, '手机号未注册', 404);
  }

  if (rider.status !== 1) {
    return error(res, '账号已被禁用', 403);
  }

  if (!rider.password_hash || !bcrypt.compareSync(password, rider.password_hash)) {
    return error(res, '手机号或密码错误', 401);
  }

  const token = generateToken(rider.id, 'rider');

  return success(res, {
    token,
    riderId: rider.id,
    name: rider.name,
    phone: rider.phone,
    role: 'rider',
  }, '登录成功');
});

/**
 * POST /api/v1/auth/rider-reset-password
 * 骑手重置密码
 * Body: { phone, newPassword }
 */
router.post('/rider-reset-password', (req, res) => {
  const { phone, newPassword } = req.body;
  if (!phone || !newPassword) return error(res, '手机号和新密码不能为空', 400);
  if (newPassword.length < 6) return error(res, '密码至少6位', 400);

  const rider = db.prepare(`SELECT id FROM rider WHERE phone = ?`).get(phone);
  if (!rider) return error(res, '手机号未注册', 404);

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare(`UPDATE rider SET password_hash = ?, updated_at = ? WHERE id = ?`).run(hash, now(), rider.id);
  return success(res, {}, '密码重置成功');
});

router.post('/login-guest', (req, res) => {
  const { role } = req.body;

  if (role === 'rider') {
    const rider = db.prepare('SELECT * FROM rider WHERE status = 1 ORDER BY id LIMIT 1').get();
    if (!rider) {
      return error(res, '演示骑手不存在，请先运行 seed', 404);
    }
    const token = generateToken(rider.id, 'rider');
    return success(res, {
      token,
      riderId: rider.id,
      name: rider.name,
      phone: rider.phone,
      role: 'rider',
    }, '体验登录成功');
  }

  if (role === 'leader') {
    const leader = db.prepare('SELECT * FROM leader WHERE status = 1 ORDER BY id LIMIT 1').get();
    if (!leader) {
      return error(res, '演示团长不存在，请先运行 seed', 404);
    }
    const token = generateToken(leader.id, 'leader');
    return success(res, {
      token,
      leaderId: leader.id,
      name: leader.name,
      phone: leader.phone,
      role: 'leader',
    }, '体验登录成功');
  }

  const userId = 1;
  const user = db.prepare('SELECT id, nick_name, avatar_url, phone, member_level, points FROM user WHERE id = ?').get(userId);

  if (!user) {
    return error(res, '演示账号不存在，请先运行 seed', 404);
  }

  db.prepare('UPDATE user SET last_login_at = datetime(\'localtime\') WHERE id = ?').run(userId);

  const token = generateToken(userId, 'user');

  return success(res, {
    token,
    userId: user.id,
    nickName: user.nick_name,
    avatarUrl: user.avatar_url,
    phone: user.phone,
    memberLevel: user.member_level,
    points: user.points,
    role: 'user',
  }, '体验登录成功');
});

/**
 * POST /api/v1/auth/admin-login
 * 管理后台登录 (独立账号体系)
 * Body: { username, password }
 */
router.post('/admin-login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return error(res, '用户名和密码不能为空', 400);
  }

  const admin = db.prepare(`
    SELECT a.*, r.name as role_name, r.permissions, r.data_scope
    FROM admin_user a
    LEFT JOIN admin_role r ON r.id = a.role_id
    WHERE a.username = ? AND a.status = 1
  `).get(username);

  if (!admin) {
    return error(res, '用户名不存在或已禁用', 404);
  }

  if (!bcrypt.compareSync(password, admin.password)) {
    return error(res, '用户名或密码错误', 401);
  }

  const { generateAdminToken } = require('../middleware/auth');
  const token = generateAdminToken(admin.id);

  return success(res, {
    token,
    adminId: admin.id,
    username: admin.username,
    realName: admin.real_name,
    roleId: admin.role_id,
    roleName: admin.role_name || '管理员',
    permissions: JSON.parse(admin.permissions || '[]'),
    dataScope: admin.data_scope || 'all',
    scopeId: admin.scope_id
  }, '登录成功');
});

module.exports = router;

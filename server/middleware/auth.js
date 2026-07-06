const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');

// JWT Secret 从环境变量读取,  fallback 仅用于开发环境
const JWT_SECRET = process.env.JWT_SECRET || 'linli-fresh-dev-only-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * JWT 认证中间件
 * 从 Authorization: Bearer <token> 中解析用户信息
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未登录或登录已过期', data: null });
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userRole = decoded.role || 'user';
    next();
  } catch (err) {
    return res.status(401).json({ code: 401, message: 'Token无效或已过期', data: null });
  }
}

/**
 * 管理员认证中间件 (支持 admin_user 表的独立账号体系)
 * 优先使用 Bearer token (admin token), 也兼容用户 token (demo 模式)
 */
function adminAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '请先登录管理后台', data: null });
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userRole = decoded.role || 'user';

    // 如果是 admin token, 加载管理员信息
    if (decoded.role === 'admin' && decoded.adminId) {
      const admin = db.prepare(`SELECT a.*, r.name as role_name, r.permissions FROM admin_user a LEFT JOIN admin_role r ON r.id = a.role_id WHERE a.id = ? AND a.status = 1`).get(decoded.adminId);
      if (!admin) {
        return res.status(403).json({ code: 403, message: '管理员账号已禁用', data: null });
      }
      req.adminId = admin.id;
      req.adminRole = admin.role_name;
      req.adminPermissions = JSON.parse(admin.permissions || '[]');
    }
    next();
  } catch (err) {
    return res.status(401).json({ code: 401, message: 'Token无效或已过期', data: null });
  }
}

/**
 * 权限检查中间件工厂
 * @param {string} permission - 需要的权限标识
 */
function requirePermission(permission) {
  return (req, res, next) => {
    // 超级管理员拥有所有权限
    if (req.adminPermissions && (req.adminPermissions.includes('*') || req.adminPermissions.includes(permission))) {
      return next();
    }
    // Demo 模式: 用户 token 可访问所有后台接口
    if (!req.adminId && req.userRole === 'user') {
      return next();
    }
    return res.status(403).json({ code: 403, message: '无操作权限', data: null });
  };
}

/**
 * 生成 JWT Token
 */
function generateToken(userId, role = 'user') {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * 生成管理员 JWT Token
 */
function generateAdminToken(adminId, role = 'admin') {
  return jwt.sign({ adminId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

module.exports = authMiddleware;
module.exports.JWT_SECRET = JWT_SECRET;
module.exports.generateToken = generateToken;
module.exports.generateAdminToken = generateAdminToken;
module.exports.adminAuthMiddleware = adminAuthMiddleware;
module.exports.requirePermission = requirePermission;

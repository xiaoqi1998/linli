const jwt = require('jsonwebtoken');

const JWT_SECRET = 'linli-fresh-demo-jwt-secret-2026';
const JWT_EXPIRES_IN = '2h';

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
 * 生成 JWT Token
 */
function generateToken(userId, role = 'user') {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

module.exports = authMiddleware;
module.exports.JWT_SECRET = JWT_SECRET;
module.exports.generateToken = generateToken;

/**
 * 简单的内存限流中间件
 * 基于 IP + 路径的滑动窗口限流
 */

const requestCounts = new Map();
const WINDOW_MS = 60 * 1000; // 1 分钟窗口

/**
 * 限流中间件
 * @param {Object} options - { max: 每窗口最大请求数, windowMs: 窗口时间(ms) }
 */
function rateLimit(options = {}) {
  const max = options.max || 60;
  const windowMs = options.windowMs || WINDOW_MS;

  return function (req, res, next) {
    const key = (req.ip || req.connection?.remoteAddress || 'unknown') + ':' + req.path;
    const now = Date.now();

    let entry = requestCounts.get(key);
    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + windowMs };
      requestCounts.set(key, entry);
    }

    entry.count++;

    if (entry.count > max) {
      return res.status(429).json({
        code: 429,
        message: '请求过于频繁，请稍后再试',
        data: null,
      });
    }

    // 设置限流响应头
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));

    next();
  };
}

// 定期清理过期的条目 (每 5 分钟)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requestCounts.entries()) {
    if (now > entry.resetTime) {
      requestCounts.delete(key);
    }
  }
}, 5 * 60 * 1000);

module.exports = rateLimit;

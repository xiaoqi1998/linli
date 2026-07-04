const { nanoid } = require('nanoid');

/**
 * 统一成功响应
 */
function success(res, data = {}, message = 'success') {
  return res.json({ code: 0, message, data });
}

/**
 * 统一错误响应
 */
function error(res, message = '操作失败', code = 1, httpStatus = 200) {
  return res.status(httpStatus).json({ code, message, data: null });
}

/**
 * 生成订单号: O + YYYYMMDDHHmmss + 4位随机
 */
function generateOrderNo() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr =
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds());
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return 'O' + dateStr + random;
}

/**
 * 生成支付流水号
 */
function generateTransactionNo() {
  return 'T' + Date.now() + nanoid(6).toUpperCase();
}

/**
 * 生成提现单号
 */
function generateWithdrawNo() {
  return 'W' + Date.now() + nanoid(6).toUpperCase();
}

/**
 * 获取当前时间的 ISO 字符串 (SQLite 兼容)
 */
function now() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * 获取若干分钟后的时间
 */
function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .substring(0, 19);
}

/**
 * 获取若干小时后的时间
 */
function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .substring(0, 19);
}

/**
 * 获取若干天后的时间
 */
function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .substring(0, 19);
}

module.exports = {
  success,
  error,
  generateOrderNo,
  generateTransactionNo,
  generateWithdrawNo,
  now,
  minutesFromNow,
  hoursFromNow,
  daysFromNow,
};

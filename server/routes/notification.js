const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error, now } = require('../helpers');
const authMiddleware = require('../middleware/auth');
const { createMessage } = require('./messages');

/**
 * POST /api/v1/notifications/subscribe
 * 订阅 Web Push (需登录, demo 模式仅返回成功)
 * Body: { endpoint, keys, p256dh, auth }
 */
router.post('/subscribe', authMiddleware, (req, res) => {
  const { endpoint, keys, p256dh, auth } = req.body;
  if (!endpoint) {
    return error(res, '缺少 endpoint 参数', 400);
  }
  // Demo: 实际项目应存入 push_subscription 表, 此处仅返回成功
  return success(res, {
    subscribed: true,
    endpoint,
    keys: keys || { p256dh, auth },
  }, '订阅成功 (demo)');
});

/**
 * POST /api/v1/notifications/send
 * 发送通知给用户 (内部接口, demo 通过 createMessage 写入 user_message 表)
 * Body: { userId, title, body, data }
 */
router.post('/send', (req, res) => {
  const { userId, title, body, data } = req.body;
  if (!userId || !title) {
    return error(res, '缺少 userId/title 参数', 400);
  }
  // Demo: 通过 createMessage 写入 user_message 表, 前端轮询读取
  const orderId = data && data.orderId ? data.orderId : null;
  createMessage(parseInt(userId), 'system', title, body || '', orderId);
  return success(res, { sent: true, userId: parseInt(userId) }, '通知已创建');
});

/**
 * GET /api/v1/notifications/settings
 * 获取用户通知设置 (需登录)
 */
router.get('/settings', authMiddleware, (req, res) => {
  // Demo: 默认全部开启 (实际项目应从 user_message_preferences 表读取)
  return success(res, {
    orderStatus: true,
    groupBuy: true,
    system: true,
  });
});

/**
 * PUT /api/v1/notifications/settings
 * 更新用户通知设置 (需登录)
 * Body: { orderStatus, groupBuy, system }
 */
router.put('/settings', authMiddleware, (req, res) => {
  const { orderStatus, groupBuy, system } = req.body;
  // Demo: 实际项目应持久化到 user_message_preferences 表
  return success(res, {
    orderStatus: orderStatus !== undefined ? !!orderStatus : true,
    groupBuy: groupBuy !== undefined ? !!groupBuy : true,
    system: system !== undefined ? !!system : true,
  }, '设置已更新');
});

module.exports = router;

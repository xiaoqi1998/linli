const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error, now } = require('../helpers');
const authMiddleware = require('../middleware/auth');

/**
 * 创建消息通知 (内部调用)
 * @param {number} userId - 接收消息的用户ID
 * @param {string} type - 消息类型 (order_paid, order_completed, refund_request, group_buy_success, etc.)
 * @param {string} title - 消息标题
 * @param {string} content - 消息内容
 * @param {number} orderId - 关联订单ID (可选)
 */
function createMessage(userId, type, title, content, orderId = null) {
  try {
    db.prepare(`
      INSERT INTO user_message (user_id, type, title, content, order_id, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(userId, type, title, content, orderId, now());
  } catch (e) {
    console.error('[createMessage] error:', e.message);
  }
}

router.use(authMiddleware);

/**
 * GET /api/v1/messages
 * 获取用户消息列表
 */
router.get('/', (req, res) => {
  const { page = 1, pageSize = 20, unreadOnly } = req.query;
  const offset = (page - 1) * pageSize;

  let sql = `SELECT * FROM user_message WHERE user_id = ?`;
  const params = [req.userId];

  if (unreadOnly === '1' || unreadOnly === 'true') {
    sql += ` AND is_read = 0`;
  }

  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const list = db.prepare(sql).all(...params);
  const { total } = db.prepare(`SELECT COUNT(*) as total FROM user_message WHERE user_id = ?`).get(req.userId);
  const { unread } = db.prepare(`SELECT COUNT(*) as unread FROM user_message WHERE user_id = ? AND is_read = 0`).get(req.userId);

  return success(res, {
    list: list.map(m => ({
      id: m.id,
      type: m.type,
      title: m.title,
      content: m.content,
      orderId: m.order_id,
      isRead: !!m.is_read,
      createdAt: m.created_at,
    })),
    total,
    unread,
    page: parseInt(page),
    pageSize: parseInt(pageSize),
  });
});

/**
 * POST /api/v1/messages/:id/read
 * 标记消息已读
 */
router.post('/:id/read', (req, res) => {
  const { id } = req.params;
  db.prepare(`UPDATE user_message SET is_read = 1 WHERE id = ? AND user_id = ?`).run(id, req.userId);
  return success(res, { id: parseInt(id), isRead: true }, '已标记为已读');
});

/**
 * POST /api/v1/messages/read-all
 * 全部标记已读
 */
router.post('/read-all', (req, res) => {
  db.prepare(`UPDATE user_message SET is_read = 1 WHERE user_id = ? AND is_read = 0`).run(req.userId);
  return success(res, null, '全部已读');
});

module.exports = router;
module.exports.createMessage = createMessage;

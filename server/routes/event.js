const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error, now } = require('../helpers');
const authMiddleware = require('../middleware/auth');

/**
 * POST /api/v1/events/track
 * 埋点事件上报 (无需登录, 有 userId 则记录)
 * Body: { eventName, properties, communityId, userId }
 */
router.post('/track', (req, res) => {
  const { eventName, properties, communityId } = req.body;

  if (!eventName) {
    return error(res, '缺少 eventName 参数', 400);
  }

  // userId 可选 (未登录场景由 body 传入, 登录场景由 auth 中间件注入)
  const userId = req.userId || (req.body.userId ? parseInt(req.body.userId) : null);

  // 获取真实 IP
  let ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress || '';
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);

  const userAgent = req.headers['user-agent'] || '';
  const propsStr = properties
    ? (typeof properties === 'string' ? properties : JSON.stringify(properties))
    : '';
  const communityIdVal = communityId ? parseInt(communityId) : null;

  try {
    db.prepare(`
      INSERT INTO event_track (event_name, user_id, community_id, properties, ip, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(eventName, userId, communityIdVal, propsStr, ip, userAgent, now());
  } catch (e) {
    console.error('[events/track] error:', e.message);
    // fire and forget, 不阻塞主流程
  }

  return success(res, { tracked: true });
});

/**
 * GET /api/v1/events/analytics
 * 事件统计分析 (需登录, 管理员)
 * Query: eventName, days
 */
router.get('/analytics', authMiddleware, (req, res) => {
  const eventName = req.query.eventName || '';
  const days = parseInt(req.query.days) || 7;

  if (!eventName) {
    return error(res, '缺少 eventName 参数', 400);
  }

  // 按日统计: 次数 + 去重用户数
  const dailyCounts = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count, COUNT(DISTINCT user_id) as unique_users
    FROM event_track
    WHERE event_name = ? AND created_at >= datetime('now', ?)
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).all(eventName, `-${days} days`);

  // 汇总
  const summary = db.prepare(`
    SELECT COUNT(*) as total_count, COUNT(DISTINCT user_id) as total_unique_users
    FROM event_track
    WHERE event_name = ? AND created_at >= datetime('now', ?)
  `).get(eventName, `-${days} days`);

  // top properties (取最近 1000 条解析)
  const recentRows = db.prepare(`
    SELECT properties FROM event_track
    WHERE event_name = ? AND properties IS NOT NULL AND properties != ''
    ORDER BY id DESC LIMIT 1000
  `).all(eventName);

  const propCount = {};
  for (const row of recentRows) {
    try {
      const obj = JSON.parse(row.properties);
      for (const key of Object.keys(obj || {})) {
        const val = String(obj[key]);
        const propKey = `${key}=${val}`;
        propCount[propKey] = (propCount[propKey] || 0) + 1;
      }
    } catch (e) {
      // 忽略非法 JSON
    }
  }
  const topProperties = Object.entries(propCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, count]) => {
      const idx = key.indexOf('=');
      return {
        property: idx > -1 ? key.substring(0, idx) : key,
        value: idx > -1 ? key.substring(idx + 1) : '',
        count,
      };
    });

  return success(res, {
    eventName,
    days,
    summary: {
      totalCount: summary?.total_count || 0,
      totalUniqueUsers: summary?.total_unique_users || 0,
    },
    dailyCounts,
    topProperties,
  });
});

module.exports = router;

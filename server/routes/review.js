const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error, now } = require('../helpers');
const authMiddleware = require('../middleware/auth');

/**
 * GET /api/v1/reviews
 * 商品评价列表 (分页)
 * Query: skuId, page, pageSize
 */
router.get('/', (req, res) => {
  const skuId = parseInt(req.query.skuId);
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const offset = (page - 1) * pageSize;

  if (!skuId) {
    return error(res, '缺少 skuId 参数', 400);
  }

  const { total } = db.prepare(`
    SELECT COUNT(*) as total FROM product_review
    WHERE sku_id = ? AND status = 1
  `).get(skuId);

  const list = db.prepare(`
    SELECT pr.id, pr.sku_id, pr.order_id, pr.user_id, pr.rating,
           pr.content, pr.images, pr.is_anonymous, pr.leader_reply,
           pr.leader_reply_at, pr.created_at,
           u.nick_name, u.avatar_url
    FROM product_review pr
    LEFT JOIN user u ON u.id = pr.user_id
    WHERE pr.sku_id = ? AND pr.status = 1
    ORDER BY pr.created_at DESC
    LIMIT ? OFFSET ?
  `).all(skuId, pageSize, offset);

  // 汇总: 平均评分, 总数
  const summary = db.prepare(`
    SELECT AVG(rating) as avg_rating, COUNT(*) as total_count
    FROM product_review WHERE sku_id = ? AND status = 1
  `).get(skuId);

  return success(res, {
    list: list.map(r => {
      let images = [];
      try { images = JSON.parse(r.images || '[]'); } catch (e) { images = []; }
      return {
        id: r.id,
        skuId: r.sku_id,
        orderId: r.order_id,
        userId: r.is_anonymous ? null : r.user_id,
        rating: r.rating,
        content: r.content,
        images,
        isAnonymous: !!r.is_anonymous,
        nickName: r.is_anonymous ? '匿名用户' : (r.nick_name || ('邻居' + r.user_id)),
        avatarUrl: r.is_anonymous ? '' : (r.avatar_url || ''),
        leaderReply: r.leader_reply,
        leaderReplyAt: r.leader_reply_at,
        createdAt: r.created_at,
      };
    }),
    summary: {
      avgRating: summary.avg_rating ? Math.round(summary.avg_rating * 10) / 10 : 0,
      totalCount: summary.total_count || 0,
    },
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
});

/**
 * GET /api/v1/reviews/recommended
 * 推荐评价 (高评分 + 有内容), 返回前 3 条
 * Query: skuId
 */
router.get('/recommended', (req, res) => {
  const skuId = parseInt(req.query.skuId);
  if (!skuId) {
    return error(res, '缺少 skuId 参数', 400);
  }

  const list = db.prepare(`
    SELECT pr.id, pr.sku_id, pr.rating, pr.content, pr.images,
           pr.is_anonymous, pr.created_at,
           u.nick_name, u.avatar_url
    FROM product_review pr
    LEFT JOIN user u ON u.id = pr.user_id
    WHERE pr.sku_id = ? AND pr.status = 1 AND pr.rating >= 4
      AND pr.content IS NOT NULL AND pr.content != ''
    ORDER BY pr.rating DESC, pr.created_at DESC
    LIMIT 3
  `).all(skuId);

  return success(res, {
    list: list.map(r => {
      let images = [];
      try { images = JSON.parse(r.images || '[]'); } catch (e) { images = []; }
      return {
        id: r.id,
        skuId: r.sku_id,
        rating: r.rating,
        content: r.content,
        images,
        isAnonymous: !!r.is_anonymous,
        nickName: r.is_anonymous ? '匿名用户' : (r.nick_name || '邻居'),
        avatarUrl: r.is_anonymous ? '' : (r.avatar_url || ''),
        createdAt: r.created_at,
      };
    }),
  });
});

/**
 * POST /api/v1/reviews
 * 提交商品评价 (需登录)
 * Body: { skuId, orderId, rating, content, images, isAnonymous }
 */
router.post('/', authMiddleware, (req, res) => {
  const { skuId, orderId, rating, content, images, isAnonymous } = req.body;
  const userId = req.userId;

  if (!skuId || !orderId || !rating) {
    return error(res, '缺少必要参数 skuId/orderId/rating', 400);
  }

  const ratingInt = parseInt(rating);
  if (ratingInt < 1 || ratingInt > 5) {
    return error(res, '评分范围 1-5', 400);
  }

  // 校验: 用户拥有该订单且订单已完成 (status = 50)
  const order = db.prepare(`
    SELECT id FROM \`order\` WHERE id = ? AND user_id = ? AND status = 50
  `).get(orderId, userId);
  if (!order) {
    return error(res, '订单不存在或未完成, 无法评价', 400);
  }

  // 校验: 订单包含该 SKU
  const orderItem = db.prepare(`
    SELECT id FROM order_item WHERE order_id = ? AND sku_id = ?
  `).get(orderId, skuId);
  if (!orderItem) {
    return error(res, '该订单未购买此商品', 400);
  }

  // 校验: 未重复评价
  const existed = db.prepare(`
    SELECT id FROM product_review WHERE order_id = ? AND sku_id = ? AND user_id = ?
  `).get(orderId, skuId, userId);
  if (existed) {
    return error(res, '您已评价过该商品', 400);
  }

  const imagesStr = Array.isArray(images) ? JSON.stringify(images) : (images || '');
  const nowStr = now();

  const txn = db.transaction(() => {
    db.prepare(`
      INSERT INTO product_review (sku_id, order_id, user_id, rating, content, images, is_anonymous, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(skuId, orderId, userId, ratingInt, content || '', imagesStr, isAnonymous ? 1 : 0, nowStr);

    // 评价奖励 10 积分
    const user = db.prepare(`SELECT points FROM user WHERE id = ?`).get(userId);
    const newPoints = (user?.points || 0) + 10;
    db.prepare(`UPDATE user SET points = points + 10 WHERE id = ?`).run(userId);
    db.prepare(`
      INSERT INTO point_transaction (user_id, type, points, balance, remark, order_id)
      VALUES (?, 1, ?, ?, '评价奖励', ?)
    `).run(userId, 10, newPoints, orderId);
  });

  try {
    txn();
    return success(res, null, '评价提交成功');
  } catch (e) {
    console.error('[reviews/submit] error:', e.message);
    return error(res, '评价提交失败: ' + e.message, 500);
  }
});

/**
 * POST /api/v1/reviews/:id/reply
 * 团长回复评价 (需登录, 仅本社区团长可回复)
 * Body: { reply }
 */
router.post('/:id/reply', authMiddleware, (req, res) => {
  const reviewId = parseInt(req.params.id);
  const { reply } = req.body;
  const userId = req.userId;

  if (!reply || !reply.trim()) {
    return error(res, '回复内容不能为空', 400);
  }

  const review = db.prepare(`
    SELECT id, order_id FROM product_review WHERE id = ? AND status = 1
  `).get(reviewId);
  if (!review) {
    return error(res, '评价不存在', 404);
  }

  // 校验: 当前用户是团长
  const leader = db.prepare(`SELECT * FROM leader WHERE user_id = ?`).get(userId);
  if (!leader) {
    return error(res, '仅团长可回复评价', 403);
  }

  // 通过订单找到社区, 校验团长归属
  const order = db.prepare(`SELECT community_id FROM \`order\` WHERE id = ?`).get(review.order_id);
  if (!order || order.community_id !== leader.community_id) {
    return error(res, '仅本社区团长可回复评价', 403);
  }

  const nowStr = now();
  db.prepare(`
    UPDATE product_review SET leader_reply = ?, leader_reply_at = ? WHERE id = ?
  `).run(reply.trim(), nowStr, reviewId);

  return success(res, {
    id: reviewId,
    leaderReply: reply.trim(),
    leaderReplyAt: nowStr,
  }, '回复成功');
});

module.exports = router;

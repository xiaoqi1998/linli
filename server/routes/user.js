const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error, now, daysFromNow } = require('../helpers');

/**
 * GET /api/v1/user/profile
 * 获取当前用户信息
 */
router.get('/profile', (req, res) => {
  const user = db.prepare(`
    SELECT id, nick_name, avatar_url, phone, member_level,
           total_consume, order_count, points, source, status, created_at
    FROM user WHERE id = ?
  `).get(req.userId);

  if (!user) {
    return error(res, '用户不存在', 404);
  }

  // 会员等级名称
  const levelNames = { 1: '新邻居', 2: '老熟人', 3: '老街坊' };
  const levelNext = { 1: 199, 2: 999 };
  const nextLevelConsume = levelNext[user.member_level] || null;

  // 获取默认社区
  const community = db.prepare(`
    SELECT c.id, c.name, c.address FROM community c WHERE c.leader_id IN (
      SELECT id FROM leader WHERE user_id = ?
    ) LIMIT 1
  `).get(req.userId);

  // 统计优惠券数量
  const { couponCount } = db.prepare(`
    SELECT COUNT(*) as couponCount FROM user_coupon WHERE user_id = ? AND status = 0
  `).get(req.userId);

  return success(res, {
    id: user.id,
    nickName: user.nick_name,
    avatarUrl: user.avatar_url,
    phone: user.phone,
    memberLevel: user.member_level,
    memberLevelName: levelNames[user.member_level] || '未知',
    nextLevelConsume,
    totalConsume: user.total_consume,
    orderCount: user.order_count,
    points: user.points,
    couponCount,
    source: user.source,
    status: user.status,
    createdAt: user.created_at,
    community: community || null,
  });
});

/**
 * PUT /api/v1/user/profile
 * 修改当前用户信息 (昵称、头像)
 */
router.put('/profile', (req, res) => {
  const { nickName, avatarUrl } = req.body;

  // 参数校验
  if (nickName === undefined && avatarUrl === undefined) {
    return error(res, '请至少修改一项信息', 400);
  }
  if (nickName !== undefined) {
    const name = String(nickName).trim();
    if (!name) return error(res, '昵称不能为空', 400);
    if (name.length > 20) return error(res, '昵称最多20个字符', 400);
  }

  // 动态构建更新语句
  const fields = [];
  const values = [];
  if (nickName !== undefined) { fields.push('nick_name = ?'); values.push(String(nickName).trim()); }
  if (avatarUrl !== undefined) { fields.push('avatar_url = ?'); values.push(String(avatarUrl).trim()); }
  values.push(req.userId);

  try {
    db.prepare(`UPDATE user SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    // 返回更新后的用户信息 (复用 GET 逻辑)
    const user = db.prepare(`
      SELECT id, nick_name, avatar_url, phone, member_level,
             total_consume, order_count, points, source, status, created_at
      FROM user WHERE id = ?
    `).get(req.userId);

    const levelNames = { 1: '新邻居', 2: '老熟人', 3: '老街坊' };
    const levelNext = { 1: 199, 2: 999 };
    const { couponCount } = db.prepare(`SELECT COUNT(*) as couponCount FROM user_coupon WHERE user_id = ? AND status = 0`).get(req.userId);

    return success(res, {
      id: user.id,
      nickName: user.nick_name,
      avatarUrl: user.avatar_url,
      phone: user.phone,
      memberLevel: user.member_level,
      memberLevelName: levelNames[user.member_level] || '未知',
      nextLevelConsume: levelNext[user.member_level] || null,
      totalConsume: user.total_consume,
      orderCount: user.order_count,
      points: user.points,
      couponCount,
    }, '修改成功');
  } catch (e) {
    return error(res, '修改失败: ' + e.message, 500);
  }
});

// ============================================================================
// 积分兑换选项 (静态配置)
// ============================================================================
const POINTS_EXCHANGE_OPTIONS = [
  { id: 1, type: 'coupon', name: '满20减5券', pointsCost: 500, couponType: 1, faceValue: 5, minOrderAmount: 20 },
  { id: 2, type: 'coupon', name: '满50减10券', pointsCost: 1000, couponType: 1, faceValue: 10, minOrderAmount: 50 },
  { id: 3, type: 'free_delivery', name: '免配送费券', pointsCost: 300, couponType: 3, faceValue: 0, minOrderAmount: 0 },
];

/**
 * POST /api/v1/user/check-in
 * 每日签到
 */
router.post('/check-in', (req, res) => {
  const today = now().substring(0, 10);

  // 检查今日是否已签到
  const existing = db.prepare(`SELECT id FROM user_check_in WHERE user_id = ? AND check_date = ?`).get(req.userId, today);
  if (existing) {
    return error(res, '今日已签到', 400);
  }

  // 计算连续签到天数: 昨天有签到记录则 +1, 否则重置为 1
  const yesterday = new Date(Date.now() - 86400000).toISOString().replace('T', ' ').substring(0, 10);
  const yesterdayRecord = db.prepare(`SELECT continuous_days FROM user_check_in WHERE user_id = ? AND check_date = ?`).get(req.userId, yesterday);
  const continuousDays = yesterdayRecord ? yesterdayRecord.continuous_days + 1 : 1;

  // 积分: 5 基础 + 奖励 (7 连续天 +10, 30 连续天 +30)
  let bonus = 0;
  if (continuousDays % 30 === 0) bonus = 30;
  else if (continuousDays % 7 === 0) bonus = 10;
  const pointsEarned = 5 + bonus;

  const user = db.prepare(`SELECT points FROM user WHERE id = ?`).get(req.userId);
  if (!user) {
    return error(res, '用户不存在', 404);
  }
  const newPoints = user.points + pointsEarned;

  const txn = db.transaction(() => {
    db.prepare(`INSERT INTO user_check_in (user_id, check_date, continuous_days, points_earned, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(req.userId, today, continuousDays, pointsEarned, now());

    db.prepare(`UPDATE user SET points = ? WHERE id = ?`).run(newPoints, req.userId);

    db.prepare(`INSERT INTO point_transaction (user_id, type, points, balance, remark, order_id) VALUES (?, 3, ?, ?, '每日签到', NULL)`)
      .run(req.userId, pointsEarned, newPoints);
  });

  try {
    txn();
    return success(res, {
      pointsEarned,
      continuousDays,
      totalPoints: newPoints,
    }, '签到成功');
  } catch (e) {
    return error(res, '签到失败: ' + e.message, 500);
  }
});

/**
 * GET /api/v1/user/points/history
 * 积分流水 (type: 1=消费获得, 2=消费退还, 3=签到, 4=评价获得, 5=兑换消耗)
 */
router.get('/points/history', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  const list = db.prepare(`
    SELECT type, points, balance, remark, order_id, created_at
    FROM point_transaction WHERE user_id = ?
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(req.userId, pageSize, offset);

  const { total } = db.prepare(`SELECT COUNT(*) as total FROM point_transaction WHERE user_id = ?`).get(req.userId);

  const typeNames = { 1: '消费获得', 2: '消费退还', 3: '签到', 4: '评价获得', 5: '兑换消耗' };

  return success(res, {
    list: list.map(t => ({
      type: t.type,
      typeName: typeNames[t.type] || '未知',
      points: t.points,
      balance: t.balance,
      remark: t.remark,
      orderId: t.order_id,
      createdAt: t.created_at,
    })),
    total,
    page,
    pageSize,
  });
});

/**
 * GET /api/v1/user/points/exchange-options
 * 积分兑换选项
 */
router.get('/points/exchange-options', (req, res) => {
  return success(res, { list: POINTS_EXCHANGE_OPTIONS });
});

/**
 * POST /api/v1/user/points/exchange
 * 积分兑换
 */
router.post('/points/exchange', (req, res) => {
  const { optionId } = req.body;

  const option = POINTS_EXCHANGE_OPTIONS.find(o => o.id === optionId);
  if (!option) {
    return error(res, '兑换选项不存在', 400);
  }

  const user = db.prepare(`SELECT points FROM user WHERE id = ?`).get(req.userId);
  if (!user) {
    return error(res, '用户不存在', 404);
  }
  if (user.points < option.pointsCost) {
    return error(res, '积分不足', 400);
  }

  const newPoints = user.points - option.pointsCost;
  const nowStr = now();
  const validEnd = daysFromNow(30);

  const txn = db.transaction(() => {
    // 扣减积分
    db.prepare(`UPDATE user SET points = ? WHERE id = ?`).run(newPoints, req.userId);

    // 积分流水 (type=5 兑换消耗)
    db.prepare(`INSERT INTO point_transaction (user_id, type, points, balance, remark, order_id) VALUES (?, 5, ?, ?, ?, NULL)`)
      .run(req.userId, -option.pointsCost, newPoints, '积分兑换: ' + option.name);

    // 创建优惠券模板 (coupon type: 1=满减, 3=免配送费)
    const couponResult = db.prepare(`
      INSERT INTO coupon (name, type, face_value, min_order_amount, applicable_type, total_count, issued_count, valid_start, valid_end, status, created_at)
      VALUES (?, ?, ?, ?, 1, 1, 1, ?, ?, 1, ?)
    `).run(option.name, option.couponType, option.faceValue, option.minOrderAmount, nowStr, validEnd, nowStr);

    // 发放到用户账户
    db.prepare(`
      INSERT INTO user_coupon (user_id, coupon_id, status, valid_start, valid_end, created_at)
      VALUES (?, ?, 0, ?, ?, ?)
    `).run(req.userId, couponResult.lastInsertRowid, nowStr, validEnd, nowStr);
  });

  try {
    txn();
    return success(res, {
      pointsCost: option.pointsCost,
      totalPoints: newPoints,
    }, '兑换成功');
  } catch (e) {
    return error(res, '兑换失败: ' + e.message, 500);
  }
});

/**
 * GET /api/v1/user/community
 * 获取用户当前社区
 */
router.get('/community', (req, res) => {
  const uc = db.prepare(`
    SELECT c.id, c.name, c.address
    FROM user_community uc
    INNER JOIN community c ON uc.community_id = c.id
    WHERE uc.user_id = ? AND uc.is_current = 1
    LIMIT 1
  `).get(req.userId);

  if (!uc) {
    return success(res, null);
  }

  return success(res, {
    id: uc.id,
    name: uc.name,
    address: uc.address,
    eta: 30,
  });
});

/**
 * POST /api/v1/user/community
 * 设置用户当前社区
 */
router.post('/community', (req, res) => {
  const { communityId } = req.body;
  if (!communityId) {
    return error(res, '请选择社区', 400);
  }

  const community = db.prepare(`SELECT id, name, address FROM community WHERE id = ?`).get(communityId);
  if (!community) {
    return error(res, '社区不存在', 404);
  }

  const txn = db.transaction(() => {
    // 将该用户所有社区设为非当前
    db.prepare(`UPDATE user_community SET is_current = 0 WHERE user_id = ?`).run(req.userId);

    // 已有记录则更新, 否则新增
    const existing = db.prepare(`SELECT id FROM user_community WHERE user_id = ? AND community_id = ?`).get(req.userId, communityId);
    if (existing) {
      db.prepare(`UPDATE user_community SET is_current = 1 WHERE id = ?`).run(existing.id);
    } else {
      db.prepare(`INSERT INTO user_community (user_id, community_id, is_current, created_at) VALUES (?, ?, 1, ?)`)
        .run(req.userId, communityId, now());
    }
  });

  try {
    txn();
    return success(res, {
      id: community.id,
      name: community.name,
      address: community.address,
      eta: 30,
    }, '设置成功');
  } catch (e) {
    return error(res, '设置失败: ' + e.message, 500);
  }
});

/**
 * GET /api/v1/user/reviews
 * 获取用户评价列表
 */
router.get('/reviews', (req, res) => {
  const list = db.prepare(`
    SELECT pr.id, pr.sku_id, pr.order_id, pr.rating, pr.content, pr.images, pr.is_anonymous, pr.created_at,
           s.name as sku_name
    FROM product_review pr
    INNER JOIN sku s ON pr.sku_id = s.id
    WHERE pr.user_id = ?
    ORDER BY pr.created_at DESC
  `).all(req.userId);

  return success(res, {
    list: list.map(r => ({
      id: r.id,
      skuId: r.sku_id,
      orderId: r.order_id,
      skuName: r.sku_name,
      rating: r.rating,
      content: r.content,
      images: r.images,
      isAnonymous: !!r.is_anonymous,
      createdAt: r.created_at,
    })),
  });
});

/**
 * POST /api/v1/user/reviews
 * 提交评价 (校验订单已完成 + 防重复, 奖励 10 积分)
 */
router.post('/reviews', (req, res) => {
  const { skuId, orderId, rating, content, images, isAnonymous } = req.body;

  if (!skuId || !orderId || rating === undefined) {
    return error(res, '请填写完整评价信息', 400);
  }

  // 校验订单归属且已完成 (status=50)
  const order = db.prepare(`SELECT id, order_no, user_id, status FROM \`order\` WHERE id = ?`).get(orderId);
  if (!order) {
    return error(res, '订单不存在', 404);
  }
  if (order.user_id !== req.userId) {
    return error(res, '无权评价此订单', 403);
  }
  if (order.status !== 50) {
    return error(res, '订单未完成，不可评价', 400);
  }

  // 校验订单包含该 SKU
  const orderItem = db.prepare(`SELECT id FROM order_item WHERE order_id = ? AND sku_id = ?`).get(orderId, skuId);
  if (!orderItem) {
    return error(res, '订单中不包含该商品', 400);
  }

  // 防重复评价
  const existing = db.prepare(`SELECT id FROM product_review WHERE user_id = ? AND order_id = ? AND sku_id = ?`).get(req.userId, orderId, skuId);
  if (existing) {
    return error(res, '已评价过该商品', 400);
  }

  const user = db.prepare(`SELECT points FROM user WHERE id = ?`).get(req.userId);
  const newPoints = user.points + 10;
  const imagesStr = images ? (typeof images === 'string' ? images : JSON.stringify(images)) : '[]';

  const txn = db.transaction(() => {
    db.prepare(`
      INSERT INTO product_review (sku_id, order_id, user_id, rating, content, images, is_anonymous, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(skuId, orderId, req.userId, rating, content || '', imagesStr, isAnonymous ? 1 : 0, now());

    // 奖励 10 积分
    db.prepare(`UPDATE user SET points = ? WHERE id = ?`).run(newPoints, req.userId);

    // 积分流水 (type=4 评价获得)
    db.prepare(`INSERT INTO point_transaction (user_id, type, points, balance, remark, order_id) VALUES (?, 4, ?, ?, '评价获得', ?)`)
      .run(req.userId, 10, newPoints, orderId);
  });

  try {
    txn();
    return success(res, { pointsEarned: 10, totalPoints: newPoints }, '评价成功');
  } catch (e) {
    return error(res, '评价失败: ' + e.message, 500);
  }
});

module.exports = router;


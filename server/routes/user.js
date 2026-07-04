const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error } = require('../helpers');

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

module.exports = router;


const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error, generateOrderNo, now, minutesFromNow } = require('../helpers');
const authMiddleware = require('../middleware/auth');
const { createMessage } = require('./messages');

/**
 * GET /api/v1/group-buys
 * 拼团列表
 * Query: communityId, page, pageSize
 */
router.get('/', (req, res) => {
  const communityId = parseInt(req.query.communityId) || 0;
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const offset = (page - 1) * pageSize;

  let sql = `
    SELECT gb.id, gb.group_price, gb.target_count, gb.joined_count,
           gb.status, gb.expire_at, gb.created_at,
           s.name, s.main_image, s.unit, s.market_price, s.sale_price,
           l.name as leader_name,
           c.name as community_name,
           cat.name as category_name
    FROM group_buy gb
    INNER JOIN sku s ON s.id = gb.sku_id
    INNER JOIN category cat ON cat.id = s.category_id
    INNER JOIN leader l ON l.id = gb.leader_id
    INNER JOIN community c ON c.id = gb.community_id
    WHERE gb.status = 1
  `;
  const params = [];

  if (communityId > 0) {
    sql += ' AND gb.community_id = ?';
    params.push(communityId);
  }

  // 总数
  let countSql = `
    SELECT COUNT(*) as total FROM group_buy gb WHERE gb.status = 1
  `;
  const countParams = [];
  if (communityId > 0) {
    countSql += ' AND gb.community_id = ?';
    countParams.push(communityId);
  }
  const { total } = db.prepare(countSql).get(...countParams);

  sql += ' ORDER BY gb.created_at DESC LIMIT ? OFFSET ?';
  params.push(pageSize, offset);

  const groupBuys = db.prepare(sql).all(...params);

  const result = groupBuys.map((gb) => {
    const catName = gb.category_name || '';
    const name = gb.name || '';
    let bg = 'bg-veg', emoji = '🛒';

    // Priority 1: product name specific emoji
    if (name.includes('苹果')) { bg = 'bg-fruit'; emoji = '🍎'; }
    else if (name.includes('香蕉')) { bg = 'bg-fruit'; emoji = '🍌'; }
    else if (name.includes('葡萄')) { bg = 'bg-fruit'; emoji = '🍇'; }
    else if (name.includes('芒果')) { bg = 'bg-fruit'; emoji = '🥭'; }
    else if (name.includes('西红柿')) { bg = 'bg-veg'; emoji = '🍅'; }
    else if (name.includes('黄瓜')) { bg = 'bg-veg'; emoji = '🥒'; }
    else if (name.includes('生菜')) { bg = 'bg-veg'; emoji = '🥬'; }
    else if (name.includes('土豆')) { bg = 'bg-veg'; emoji = '🥔'; }
    else if (name.includes('鸡蛋')) { bg = 'bg-meat'; emoji = '🥚'; }
    else if (name.includes('鸡胸')) { bg = 'bg-meat'; emoji = '🍗'; }
    else if (name.includes('五花')) { bg = 'bg-meat'; emoji = '🥓'; }
    else if (name.includes('牛仔骨')) { bg = 'bg-meat'; emoji = '🥩'; }
    else if (name.includes('虾')) { bg = 'bg-sea'; emoji = '🦐'; }
    else if (name.includes('鲈鱼')) { bg = 'bg-sea'; emoji = '🐟'; }
    else if (name.includes('三文鱼')) { bg = 'bg-sea'; emoji = '🐟'; }
    else if (name.includes('米')) { bg = 'bg-grain'; emoji = '🍚'; }
    else if (name.includes('油')) { bg = 'bg-grain'; emoji = '🫗'; }
    else if (name.includes('酱油')) { bg = 'bg-grain'; emoji = '🧴'; }
    else if (name.includes('醋')) { bg = 'bg-grain'; emoji = '🧴'; }
    else if (name.includes('牛奶')) { bg = 'bg-milk'; emoji = '🥛'; }
    else if (name.includes('酸奶')) { bg = 'bg-milk'; emoji = '🥛'; }
    else if (name.includes('奶酪')) { bg = 'bg-milk'; emoji = '🧀'; }
    else if (name.includes('可乐')) { bg = 'bg-snack'; emoji = '🥤'; }
    else if (name.includes('坚果')) { bg = 'bg-snack'; emoji = '🥜'; }
    else if (name.includes('饼干')) { bg = 'bg-snack'; emoji = '🍪'; }
    else if (name.includes('山泉')) { bg = 'bg-snack'; emoji = '💧'; }
    else if (name.includes('纸巾')) { bg = 'bg-daily'; emoji = '🧻'; }
    else if (name.includes('洗衣')) { bg = 'bg-daily'; emoji = '🧺'; }
    else if (name.includes('垃圾袋')) { bg = 'bg-daily'; emoji = '🗑️'; }
    else if (name.includes('洗洁精')) { bg = 'bg-daily'; emoji = '🧴'; }
    // Priority 2: category-level fallback
    else if (catName.includes('水果')) { bg = 'bg-fruit'; emoji = '🍎'; }
    else if (catName.includes('蔬菜')) { bg = 'bg-veg'; emoji = '🥬'; }
    else if (catName.includes('肉') || catName.includes('蛋')) { bg = 'bg-meat'; emoji = '🥚'; }
    else if (catName.includes('水产') || catName.includes('鱼') || catName.includes('虾')) { bg = 'bg-sea'; emoji = '🐟'; }
    else if (catName.includes('粮油') || catName.includes('米') || catName.includes('油')) { bg = 'bg-grain'; emoji = '🍚'; }
    else if (catName.includes('乳') || catName.includes('奶')) { bg = 'bg-milk'; emoji = '🥛'; }
    else if (catName.includes('零食') || catName.includes('饮料')) { bg = 'bg-snack'; emoji = '🥤'; }
    else if (catName.includes('日用')) { bg = 'bg-daily'; emoji = '🧻'; }

    return {
      id: gb.id,
      name: gb.name,
      mainImage: gb.main_image,
      unit: gb.unit,
      marketPrice: gb.market_price,
      salePrice: gb.sale_price,
      groupPrice: gb.group_price,
      targetCount: gb.target_count,
      joinedCount: gb.joined_count,
      remainCount: Math.max(0, gb.target_count - gb.joined_count),
      status: gb.status,
      expireAt: gb.expire_at,
      leaderName: gb.leader_name,
      communityName: gb.community_name,
      createdAt: gb.created_at,
      bg,
      emoji,
    };
  });

  return success(res, {
    list: result,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
});

/**
 * GET /api/v1/group-buys/:id
 * 拼团详情
 */
router.get('/:id', (req, res) => {
  const gbId = parseInt(req.params.id);

  const gb = db.prepare(`
    SELECT gb.*, s.name as sku_name, s.main_image, s.subtitle, s.unit,
           s.market_price, s.sale_price, s.origin,
           l.name as leader_name, l.avatar_url as leader_avatar,
           c.name as community_name
    FROM group_buy gb
    INNER JOIN sku s ON s.id = gb.sku_id
    INNER JOIN leader l ON l.id = gb.leader_id
    INNER JOIN community c ON c.id = gb.community_id
    WHERE gb.id = ?
  `).get(gbId);

  if (!gb) {
    return error(res, '拼团不存在', 404);
  }

  // 获取参与者
  const participants = db.prepare(`
    SELECT gbp.id, gbp.user_id, gbp.status, gbp.created_at,
           u.nick_name, u.avatar_url
    FROM group_buy_participant gbp
    INNER JOIN user u ON u.id = gbp.user_id
    WHERE gbp.group_buy_id = ?
    ORDER BY gbp.created_at ASC
  `).all(gbId);

  return success(res, {
    id: gb.id,
    skuId: gb.sku_id,
    skuName: gb.sku_name,
    mainImage: gb.main_image,
    subtitle: gb.subtitle,
    unit: gb.unit,
    marketPrice: gb.market_price,
    salePrice: gb.sale_price,
    groupPrice: gb.group_price,
    origin: gb.origin,
    targetCount: gb.target_count,
    joinedCount: gb.joined_count,
    remainCount: Math.max(0, gb.target_count - gb.joined_count),
    status: gb.status,
    expireAt: gb.expire_at,
    leaderName: gb.leader_name,
    leaderAvatar: gb.leader_avatar,
    communityName: gb.community_name,
    participants: participants.map((p) => ({
      id: p.id,
      userId: p.user_id,
      nickName: p.nick_name,
      avatarUrl: p.avatar_url,
      status: p.status,
      joinedAt: p.created_at,
    })),
  });
});

/**
 * POST /api/v1/group-buys/:id/join
 * 参加拼团 (需要登录)
 * Body: { skuSpecId?, quantity? }
 */
router.post('/:id/join', authMiddleware, (req, res) => {
  const gbId = parseInt(req.params.id);
  const { skuSpecId } = req.body;

  const gb = db.prepare(`
    SELECT gb.*, s.name as sku_name, s.main_image, s.sale_price, s.unit,
           wc.warehouse_id
    FROM group_buy gb
    INNER JOIN sku s ON s.id = gb.sku_id
    INNER JOIN warehouse_coverage wc ON wc.community_id = gb.community_id
    WHERE gb.id = ? AND gb.status = 1
    LIMIT 1
  `).get(gbId);

  if (!gb) {
    return error(res, '拼团不存在或已结束', 404);
  }

  // 检查是否已参加
  const existing = db.prepare(`
    SELECT id FROM group_buy_participant
    WHERE group_buy_id = ? AND user_id = ? AND status = 1
  `).get(gbId, req.userId);

  if (existing) {
    return error(res, '您已参加该拼团', 409);
  }

  // 检查是否已满
  if (gb.joined_count >= gb.target_count) {
    return error(res, '拼团已满员', 409);
  }

  // 拼团每人限购 1 件 (PRD 6.2.7)
  const userJoinedCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM group_buy_participant
    WHERE group_buy_id = ? AND user_id = ?
  `).get(gbId, req.userId);
  if (userJoinedCount.cnt >= 1) {
    return error(res, '每人仅可参团 1 次', 409);
  }

  // 校验库存
  const inv = db.prepare(`SELECT * FROM inventory WHERE warehouse_id = ? AND sku_id = ?`).get(gb.warehouse_id, gb.sku_id);
  if (!inv || inv.available_stock < 1) {
    return error(res, '商品库存不足', 409);
  }

  // 创建拼团订单
  const orderNo = generateOrderNo();
  const orderPrice = gb.group_price;
  const expireAt = minutesFromNow(15);

  const joinTxn = db.transaction(() => {
    const orderResult = db.prepare(`
      INSERT INTO "order" (
        order_no, user_id, community_id, warehouse_id, leader_id,
        address_id, address_snapshot, status, delivery_type,
        delivery_time_type, delivery_fee, sku_total_amount,
        pay_amount, source, group_buy_id, expire_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, 10, 2, 1, 0, ?, ?, 'group_buy', ?, ?)
    `).run(
      orderNo, req.userId, gb.community_id, gb.warehouse_id, gb.leader_id,
      JSON.stringify({ note: '拼团订单' }),
      orderPrice, orderPrice, gbId, expireAt
    );

    const orderId = orderResult.lastInsertRowid;

    // 创建订单项
    db.prepare(`
      INSERT INTO order_item (order_id, sku_id, sku_spec_id, sku_name, sku_image, spec_name, price, quantity, commission_rate, commission_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      orderId, gb.sku_id, skuSpecId || gb.sku_spec_id,
      gb.sku_name, gb.main_image, gb.unit,
      gb.group_price, gb.commission_rate || 5.00,
      parseFloat((gb.group_price * (gb.commission_rate || 5.00) / 100).toFixed(2))
    );

    // 锁定库存 (拼团订单也进库存管控)
    const invResult = db.prepare(`
      UPDATE inventory SET available_stock = available_stock - 1, locked_stock = locked_stock + 1
      WHERE warehouse_id = ? AND sku_id = ? AND available_stock >= 1
    `).run(gb.warehouse_id, gb.sku_id);
    if (invResult.changes === 0) {
      throw new Error('商品库存不足');
    }

    // 添加拼团参与者
    db.prepare(`
      INSERT INTO group_buy_participant (group_buy_id, user_id, order_id, status)
      VALUES (?, ?, ?, 1)
    `).run(gbId, req.userId, orderId);

    // 更新拼团已参团人数
    db.prepare(`
      UPDATE group_buy SET joined_count = joined_count + 1, updated_at = datetime('localtime')
      WHERE id = ?
    `).run(gbId);

    // 检查是否成团
    const updatedGb = db.prepare('SELECT joined_count, target_count FROM group_buy WHERE id = ?').get(gbId);
    if (updatedGb.joined_count >= updatedGb.target_count) {
      db.prepare('UPDATE group_buy SET status = 2, updated_at = datetime(\'localtime\') WHERE id = ?').run(gbId);

      // 通知所有参与者成团
      const participants = db.prepare(`SELECT user_id FROM group_buy_participant WHERE group_buy_id = ? AND status = 1`).all(gbId);
      for (const p of participants) {
        createMessage(p.user_id, 'group_buy_success', '拼团成功', `您参与的拼团已成功，请等待配送`, null);
      }
    }

    // 订单状态日志
    db.prepare(`
      INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark)
      VALUES (?, NULL, 10, 'system', '拼团订单创建')
    `).run(orderId);

    return orderId;
  });

  let orderId;
  try {
    orderId = joinTxn();
  } catch (e) {
    return error(res, e.message || '参团失败', 400);
  }

  const updatedGb = db.prepare('SELECT joined_count, target_count FROM group_buy WHERE id = ?').get(gbId);

  return success(res, {
    orderNo,
    orderId,
    groupBuyId: gbId,
    groupPrice: gb.group_price,
    expireAt,
    remainCount: Math.max(0, updatedGb.target_count - updatedGb.joined_count),
  }, '参团成功, 请尽快支付');
});

module.exports = router;


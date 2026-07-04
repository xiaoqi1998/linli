const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error, now, generateWithdrawNo } = require('../helpers');
const authMiddleware = require('../middleware/auth');
const { createMessage } = require('./messages');
const { settleCommissionForOrder } = require('../scheduler');

router.use(authMiddleware);

// Demo fallback: if current user is not a leader, use the first leader for demo
function getLeader(userId) {
  const leader = db.prepare(`SELECT * FROM leader WHERE user_id = ?`).get(userId);
  if (leader) return leader;
  // Demo mode fallback
  return db.prepare(`SELECT * FROM leader ORDER BY id LIMIT 1`).get();
}

/**
 * GET /api/v1/leader/dashboard
 * 团长今日数据看板
 */
router.get('/dashboard', (req, res) => {
  const leader = getLeader(req.userId);
  if (!leader) {
    return success(res, {
      today: { orderCount: 0, orderCountChange: 0, salesAmount: '0.00', salesAmountChange: 0, commission: '0.00', commissionChange: 0, pendingOrderCount: 0 },
      trend: []
    });
  }

  const today = new Date().toISOString().substring(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10);

  // 今日订单
  const todayOrders = db.prepare(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(pay_amount), 0) as total
    FROM \`order\` WHERE leader_id = ? AND DATE(pay_time) = ? AND pay_status = 1
  `).get(leader.id, today);

  // 昨日订单
  const yesterdayOrders = db.prepare(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(pay_amount), 0) as total
    FROM \`order\` WHERE leader_id = ? AND DATE(pay_time) = ? AND pay_status = 1
  `).get(leader.id, yesterday);

  // 今日佣金
  const todayCommission = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM commission_settlement WHERE leader_id = ? AND DATE(created_at) = ?
  `).get(leader.id, today);

  // 昨日佣金
  const yesterdayCommission = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM commission_settlement WHERE leader_id = ? AND DATE(created_at) = ?
  `).get(leader.id, yesterday);

  // 待配送订单
  const pendingOrders = db.prepare(`
    SELECT COUNT(*) as cnt FROM \`order\` WHERE leader_id = ? AND status = 20
  `).get(leader.id);

  // 环比变化百分比 (较昨日)
  function pct(curr, prev) {
    const c = Number(curr) || 0;
    const p = Number(prev) || 0;
    if (p === 0) return c > 0 ? 100 : 0;
    return Math.round(((c - p) / p) * 100);
  }

  // 近7天趋势
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().substring(0, 10);
    const r = db.prepare(`
      SELECT COUNT(*) as cnt FROM \`order\` WHERE leader_id = ? AND DATE(created_at) = ?
    `).get(leader.id, d);
    trend.push({ date: d.substring(5), orderCount: r.cnt });
  }

  return success(res, {
    today: {
      orderCount: todayOrders.cnt,
      orderCountChange: pct(todayOrders.cnt, yesterdayOrders.cnt),
      salesAmount: todayOrders.total.toFixed(2),
      salesAmountChange: pct(todayOrders.total, yesterdayOrders.total),
      commission: todayCommission.total.toFixed(2),
      commissionChange: pct(todayCommission.total, yesterdayCommission.total),
      pendingOrderCount: pendingOrders.cnt
    },
    trend
  });
});

/**
 * GET /api/v1/leader/orders
 * 团长订单管理
 */
router.get('/orders', (req, res) => {
  const leader = getLeader(req.userId);
  if (!leader) {
    return success(res, { list: [] });
  }

  const { status, page = 1, pageSize = 20 } = req.query;
  const offset = (page - 1) * pageSize;

  let sql = `SELECT o.* FROM \`order\` o WHERE o.leader_id = ?`;
  const params = [leader.id];

  if (status) {
    sql += ` AND o.status = ?`;
    params.push(parseInt(status));
  }

  sql += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const orders = db.prepare(sql).all(...params);
  const itemStmt = db.prepare(`SELECT * FROM order_item WHERE order_id = ?`);

  const result = orders.map(o => {
    const items = itemStmt.all(o.id);
    return { ...o, items };
  });

  return success(res, { list: result, total: result.length });
});

/**
 * GET /api/v1/leader/commission
 * 团长佣金明细
 */
router.get('/commission', (req, res) => {
  const leader = getLeader(req.userId);
  if (!leader) {
    return success(res, { list: [], total: 0, withdrawable: 0 });
  }

  const records = db.prepare(`
    SELECT cs.*, o.order_no FROM commission_settlement cs
    LEFT JOIN \`order\` o ON cs.order_id = o.id
    WHERE cs.leader_id = ?
    ORDER BY cs.created_at DESC
    LIMIT 50
  `).all(leader.id);

  return success(res, {
    list: records,
    total: leader.total_commission,
    withdrawable: leader.withdrawable_commission
  });
});

/**
 * GET /api/v1/leader/products
 * 团长可开团的商品列表
 */
router.get('/products', (req, res) => {
  const leader = getLeader(req.userId);
  if (!leader) {
    return success(res, { list: [] });
  }

  const products = db.prepare(`
    SELECT s.id, s.name, s.subtitle, s.main_image, s.unit,
           s.sale_price, s.market_price, s.commission_rate, s.origin,
           c.name as category_name
    FROM sku s
    LEFT JOIN category c ON c.id = s.category_id
    WHERE s.status = 1
    ORDER BY s.sales_count DESC
    LIMIT 50
  `).all();

  return success(res, { list: products });
});

/**
 * POST /api/v1/leader/group-buys
 * 团长一键开团
 * Body: { skuId, groupPrice, targetCount, expireHours }
 */
router.post('/group-buys', (req, res) => {
  const leader = getLeader(req.userId);
  if (!leader) {
    return error(res, '您不是团长，无法开团', 403);
  }

  const { skuId, groupPrice, targetCount, expireHours } = req.body;

  if (!skuId || !groupPrice || !targetCount) {
    return error(res, '参数不完整', 400);
  }

  const sku = db.prepare('SELECT id, name, sale_price, commission_rate FROM sku WHERE id = ? AND status = 1').get(skuId);
  if (!sku) {
    return error(res, '商品不存在或已下架', 404);
  }

  if (groupPrice >= sku.sale_price) {
    return error(res, '拼团价需低于商品原价', 400);
  }

  if (targetCount < 2 || targetCount > 100) {
    return error(res, '成团人数需在2-100之间', 400);
  }

  // 拼团最长 48 小时
  const hours = Math.min(expireHours || 24, 48);
  const expireAt = new Date(Date.now() + hours * 3600 * 1000)
    .toISOString().replace('T', ' ').substring(0, 19);

  // 检查团长同时最多 5 个拼团
  const activeGroupBuys = db.prepare(`SELECT COUNT(*) as cnt FROM group_buy WHERE leader_id = ? AND status = 1`).get(leader.id);
  if (activeGroupBuys.cnt >= 5) {
    return error(res, '您已有 5 个进行中的拼团，请先等待成团', 400);
  }

  const result = db.prepare(`
    INSERT INTO group_buy (leader_id, community_id, sku_id, sku_spec_id, group_price, target_count, joined_count, status, expire_at)
    VALUES (?, ?, ?, NULL, ?, ?, 0, 1, ?)
  `).run(
    leader.id, leader.community_id, skuId,
    groupPrice, targetCount,
    expireAt
  );

  return success(res, {
    id: result.lastInsertRowid,
    skuId,
    skuName: sku.name,
    groupPrice,
    targetCount,
    expireAt,
  }, '开团成功');
});

/* ==========================================================================
   订单状态管理 (订单状态机闭环)
   ========================================================================== */

/**
 * POST /api/v1/leader/orders/:id/dispatch
 * 团长标记订单为配送中 (20 → 30, 自动分配骑手)
 */
router.post('/orders/:id/dispatch', (req, res) => {
  const leader = getLeader(req.userId);
  if (!leader) {
    return error(res, '您不是团长', 403);
  }

  const orderId = parseInt(req.params.id);
  const order = db.prepare(`SELECT * FROM \`order\` WHERE id = ? AND leader_id = ?`).get(orderId, leader.id);
  if (!order) {
    return error(res, '订单不存在', 404);
  }
  if (order.status !== 20) {
    return error(res, '当前订单状态不可派单', 400);
  }

  // 自动分配骑手 (选择当前订单最少的骑手)
  const rider = db.prepare(`
    SELECT * FROM rider WHERE warehouse_id = ? AND status = 1
    ORDER BY current_orders ASC, id ASC LIMIT 1
  `).get(order.warehouse_id);

  if (!rider) {
    return error(res, '暂无可用骑手', 400);
  }

  const nowStr = now();
  const dispatchTxn = db.transaction(() => {
    db.prepare(`UPDATE \`order\` SET status = 30, rider_id = ?, rider_accept_time = ? WHERE id = ?`)
      .run(rider.id, nowStr, orderId);

    db.prepare(`INSERT INTO rider_delivery (order_id, rider_id, status, accept_time, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)`)
      .run(orderId, rider.id, nowStr, nowStr, nowStr);

    db.prepare(`UPDATE rider SET current_orders = current_orders + 1 WHERE id = ?`).run(rider.id);

    db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, 20, 30, ?, '团长派单')`)
      .run(orderId, 'leader');

    createMessage(order.user_id, 'order_dispatching', '订单配送中', `订单 ${order.order_no} 已派单，骑手正在赶来`, orderId);
  });

  try {
    dispatchTxn();
  } catch (e) {
    return error(res, '派单失败: ' + e.message, 500);
  }

  return success(res, { orderId, status: 30, riderName: rider.name, riderPhone: rider.phone }, '已派单，订单配送中');
});

/**
 * POST /api/v1/leader/orders/:id/deliver
 * 团长标记订单已送达 (30 → 40)
 */
router.post('/orders/:id/deliver', (req, res) => {
  const leader = getLeader(req.userId);
  if (!leader) {
    return error(res, '您不是团长', 403);
  }

  const orderId = parseInt(req.params.id);
  const order = db.prepare(`SELECT * FROM \`order\` WHERE id = ? AND leader_id = ?`).get(orderId, leader.id);
  if (!order) {
    return error(res, '订单不存在', 404);
  }
  if (order.status !== 30) {
    return error(res, '当前订单状态不可标记送达', 400);
  }

  const nowStr = now();
  const deliverTxn = db.transaction(() => {
    db.prepare(`UPDATE \`order\` SET status = 40, delivered_time = ? WHERE id = ?`).run(nowStr, orderId);

    if (order.rider_id) {
      db.prepare(`UPDATE rider_delivery SET status = 3, deliver_time = ?, updated_at = ? WHERE order_id = ? AND rider_id = ?`)
        .run(nowStr, nowStr, orderId, order.rider_id);
      db.prepare(`UPDATE rider SET current_orders = current_orders - 1 WHERE id = ? AND current_orders > 0`).run(order.rider_id);
    }

    db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, 30, 40, ?, '团长确认送达')`)
      .run(orderId, 'leader');

    createMessage(order.user_id, 'order_delivered', '订单已送达', `订单 ${order.order_no} 已送达，请确认收货`, orderId);
  });

  try {
    deliverTxn();
  } catch (e) {
    return error(res, '操作失败: ' + e.message, 500);
  }

  return success(res, { orderId, status: 40 }, '已标记为送达');
});

/**
 * POST /api/v1/leader/orders/:id/confirm
 * 团长替用户确认收货 (40 → 50)
 */
router.post('/orders/:id/confirm', (req, res) => {
  const leader = getLeader(req.userId);
  if (!leader) {
    return error(res, '您不是团长', 403);
  }

  const orderId = parseInt(req.params.id);
  const order = db.prepare(`SELECT * FROM \`order\` WHERE id = ? AND leader_id = ?`).get(orderId, leader.id);
  if (!order) {
    return error(res, '订单不存在', 404);
  }
  if (order.status !== 40) {
    return error(res, '当前订单状态不可确认', 400);
  }

  const nowStr = now();
  const confirmTxn = db.transaction(() => {
    db.prepare(`UPDATE \`order\` SET status = 50, completed_time = ? WHERE id = ?`).run(nowStr, orderId);

    db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, 40, 50, ?, '团长确认完成')`)
      .run(orderId, 'leader');

    createMessage(order.user_id, 'order_completed', '订单已完成', `订单 ${order.order_no} 已完成`, orderId);

    // 结算佣金
    settleCommissionForOrder(order);
  });

  try {
    confirmTxn();
  } catch (e) {
    return error(res, '操作失败: ' + e.message, 500);
  }

  return success(res, { orderId, status: 50 }, '订单已完成');
});

/* ==========================================================================
   售后管理
   ========================================================================== */

/**
 * GET /api/v1/leader/refunds
 * 团长待处理的售后申请列表
 */
router.get('/refunds', (req, res) => {
  const leader = getLeader(req.userId);
  if (!leader) {
    return success(res, { list: [] });
  }

  const refunds = db.prepare(`
    SELECT r.*, o.order_no, o.pay_amount, o.status as order_status,
           u.nick_name, u.phone,
           (SELECT GROUP_CONCAT(sku_name || ' x' || quantity, '; ') FROM order_item WHERE order_id = o.id) as items_summary
    FROM refund r
    LEFT JOIN \`order\` o ON o.id = r.order_id
    LEFT JOIN user u ON u.id = r.user_id
    WHERE r.leader_id = ?
    ORDER BY r.created_at DESC
  `).all(leader.id);

  return success(res, {
    list: refunds.map(r => ({
      id: r.id,
      orderId: r.order_id,
      orderNo: r.order_no,
      userId: r.user_id,
      userName: r.nick_name,
      userPhone: r.phone,
      amount: r.amount,
      reason: r.reason,
      status: r.status,
      statusText: { 0: '待处理', 1: '已同意退款', 2: '已拒绝' }[r.status] || '未知',
      itemsSummary: r.items_summary,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

/**
 * POST /api/v1/leader/refunds/:id/approve
 * 团长同意退款
 */
router.post('/refunds/:id/approve', (req, res) => {
  const leader = getLeader(req.userId);
  if (!leader) {
    return error(res, '您不是团长', 403);
  }

  const refundId = parseInt(req.params.id);
  const refund = db.prepare(`SELECT * FROM refund WHERE id = ? AND leader_id = ? AND status = 0`).get(refundId, leader.id);
  if (!refund) {
    return error(res, '退款申请不存在或已处理', 404);
  }

  const order = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(refund.order_id);
  const nowStr = now();

  const refundTxn = db.transaction(() => {
    // 更新退款状态
    db.prepare(`UPDATE refund SET status = 1, updated_at = ? WHERE id = ?`).run(nowStr, refundId);

    // 订单标记为已取消 (退款)
    db.prepare(`UPDATE \`order\` SET status = 99, cancel_time = ?, cancel_reason = ? WHERE id = ?`)
      .run(nowStr, '团长同意退款', order.id);

    // 库存回补
    const items = db.prepare(`SELECT * FROM order_item WHERE order_id = ?`).all(order.id);
    const updateInv = db.prepare(`UPDATE inventory SET available_stock = available_stock + ? WHERE warehouse_id = ? AND sku_id = ?`);
    for (const item of items) {
      updateInv.run(item.quantity, order.warehouse_id, item.sku_id);
    }

    db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, ?, 99, ?, '团长同意退款')`)
      .run(order.id, order.status, 'leader');

    // 通知用户
    createMessage(order.user_id, 'refund_approved', '退款已通过', `订单 ${order.order_no} 的退款申请已通过，退款 ¥${refund.amount.toFixed(2)} 将原路退回`, order.id);
  });

  try {
    refundTxn();
  } catch (e) {
    return error(res, '退款失败: ' + e.message, 500);
  }

  return success(res, { refundId, status: 1 }, '已同意退款');
});

/**
 * POST /api/v1/leader/refunds/:id/reject
 * 团长拒绝退款
 * Body: { rejectReason }
 */
router.post('/refunds/:id/reject', (req, res) => {
  const leader = getLeader(req.userId);
  if (!leader) {
    return error(res, '您不是团长', 403);
  }

  const refundId = parseInt(req.params.id);
  const { rejectReason = '' } = req.body;
  const refund = db.prepare(`SELECT * FROM refund WHERE id = ? AND leader_id = ? AND status = 0`).get(refundId, leader.id);
  if (!refund) {
    return error(res, '退款申请不存在或已处理', 404);
  }

  const order = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(refund.order_id);
  const nowStr = now();

  db.prepare(`UPDATE refund SET status = 2, updated_at = ? WHERE id = ?`).run(nowStr, refundId);

  db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, ?, ?, ?, ?)`)
    .run(order.id, order.status, order.status, 'leader', `拒绝退款: ${rejectReason}`);

  createMessage(order.user_id, 'refund_rejected', '退款被拒绝', `订单 ${order.order_no} 的退款申请被拒绝，原因: ${rejectReason}`, order.id);

  return success(res, { refundId, status: 2 }, '已拒绝退款');
});

/* ==========================================================================
   提现管理
   ========================================================================== */

/**
 * POST /api/v1/leader/withdraw
 * 团长申请提现
 * Body: { amount }
 */
router.post('/withdraw', (req, res) => {
  const leader = getLeader(req.userId);
  if (!leader) {
    return error(res, '您不是团长', 403);
  }

  const { amount } = req.body;
  const withdrawAmount = parseFloat(amount);

  if (!withdrawAmount || withdrawAmount <= 0) {
    return error(res, '提现金额必须大于0', 400);
  }

  // 最低 10 元，最高 5000 元
  if (withdrawAmount < 10) {
    return error(res, '最低提现金额为 10 元', 400);
  }
  if (withdrawAmount > 5000) {
    return error(res, '单次最高提现金额为 5000 元', 400);
  }

  if (withdrawAmount > leader.withdrawable_commission) {
    return error(res, '可提现佣金不足', 400);
  }

  const withdrawNo = generateWithdrawNo();
  const nowStr = now();

  const withdrawTxn = db.transaction(() => {
    db.prepare(`INSERT INTO leader_withdraw (leader_id, withdraw_no, amount, status, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)`)
      .run(leader.id, withdrawNo, withdrawAmount, nowStr, nowStr);

    // 冻结提现金额
    db.prepare(`UPDATE leader SET withdrawable_commission = withdrawable_commission - ? WHERE id = ?`)
      .run(withdrawAmount, leader.id);
  });

  try {
    withdrawTxn();
  } catch (e) {
    return error(res, '提现申请失败: ' + e.message, 500);
  }

  createMessage(leader.user_id, 'withdraw_applied', '提现申请已提交', `提现申请 ¥${withdrawAmount.toFixed(2)} 已提交，等待审核`, null);

  return success(res, { withdrawNo, amount: withdrawAmount, status: 0 }, '提现申请已提交');
});

/**
 * GET /api/v1/leader/withdrawals
 * 团长提现记录
 */
router.get('/withdrawals', (req, res) => {
  const leader = getLeader(req.userId);
  if (!leader) {
    return success(res, { list: [] });
  }

  const list = db.prepare(`SELECT * FROM leader_withdraw WHERE leader_id = ? ORDER BY created_at DESC LIMIT 50`).all(leader.id);

  return success(res, {
    list: list.map(w => ({
      id: w.id,
      withdrawNo: w.withdraw_no,
      amount: w.amount,
      status: w.status,
      statusText: { 0: '处理中', 1: '已到账', 2: '已拒绝' }[w.status] || '未知',
      rejectReason: w.reject_reason,
      createdAt: w.created_at,
    })),
    withdrawable: leader.withdrawable_commission,
  });
});

/* ==========================================================================
   消息通知
   ========================================================================== */

/**
 * GET /api/v1/leader/messages
 * 团长消息列表
 */
router.get('/messages', (req, res) => {
  const leader = getLeader(req.userId);
  if (!leader) {
    return success(res, { list: [], unread: 0 });
  }

  const list = db.prepare(`SELECT * FROM user_message WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`).all(leader.user_id);
  const { unread } = db.prepare(`SELECT COUNT(*) as unread FROM user_message WHERE user_id = ? AND is_read = 0`).get(leader.user_id);

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
    unread,
  });
});

module.exports = router;


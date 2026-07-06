const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error, now } = require('../helpers');
const authMiddleware = require('../middleware/auth');
const { createMessage } = require('./messages');

router.use(authMiddleware);

/**
 * 获取骑手信息 (Demo: 如果用户不是骑手，返回第一个骑手)
 */
function getRider(userId) {
  const rider = db.prepare(`SELECT * FROM rider WHERE name IN (SELECT nick_name FROM user WHERE id = ?) OR phone IN (SELECT phone FROM user WHERE id = ?)`).get(userId, userId);
  if (rider) return rider;
  return db.prepare(`SELECT * FROM rider WHERE status = 1 ORDER BY id LIMIT 1`).get();
}

/**
 * GET /api/v1/rider/orders
 * 骑手待配送订单列表
 */
router.get('/orders', (req, res) => {
  const rider = getRider(req.userId);
  if (!rider) {
    return success(res, { list: [] });
  }

  const { status } = req.query;

  let sql = `
    SELECT o.id, o.order_no, o.status, o.pay_amount, o.pay_time,
           o.address_snapshot, o.delivery_time_slot,
           u.nick_name, u.phone as user_phone,
           c.name as community_name
    FROM \`order\` o
    LEFT JOIN user u ON u.id = o.user_id
    LEFT JOIN community c ON c.id = o.community_id
    WHERE o.status IN (20, 30, 40) AND o.warehouse_id = ?
  `;
  const params = [rider.warehouse_id];

  if (status) {
    sql += ` AND o.status = ?`;
    params.push(parseInt(status));
  }

  sql += ` ORDER BY o.pay_time ASC`;

  const orders = db.prepare(sql).all(...params);

  const result = orders.map(o => {
    const items = db.prepare(`SELECT sku_name, spec_name, price, quantity FROM order_item WHERE order_id = ?`).all(o.id);
    let address = {};
    try { address = JSON.parse(o.address_snapshot || '{}'); } catch (e) {}
    return {
      id: o.id,
      orderNo: o.order_no,
      status: o.status,
      statusText: { 20: '待取货', 30: '配送中', 40: '已送达' }[o.status] || '',
      payAmount: o.pay_amount,
      payTime: o.pay_time,
      items,
      address,
      userName: o.nick_name,
      userPhone: o.user_phone,
      communityName: o.community_name,
    };
  });

  return success(res, { list: result, total: result.length });
});

/**
 * POST /api/v1/rider/location
 * 骑手上报位置 (演示: 由前端定时调用)
 * Body: { lat, lng }
 */
router.post('/location', (req, res) => {
  const { lat, lng } = req.body;
  if (isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
    return error(res, '经纬度无效', 400);
  }
  const rider = getRider(req.userId);
  if (!rider) {
    return error(res, '骑手信息不存在', 404);
  }
  const nowStr = now();
  db.prepare(`UPDATE rider SET lat = ?, lng = ?, location_updated_at = ? WHERE id = ?`)
    .run(parseFloat(lat), parseFloat(lng), nowStr, rider.id);
  return success(res, { updated: true }, '位置已更新');
});

/**
 * POST /api/v1/rider/orders/:id/accept
 * 骑手接单 (订单 20 → 30 配送中)
 */
router.post('/orders/:id/accept', (req, res) => {
  const orderId = parseInt(req.params.id);
  const rider = getRider(req.userId);
  if (!rider) {
    return error(res, '骑手信息不存在', 404);
  }

  const order = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(orderId);
  if (!order) {
    return error(res, '订单不存在', 404);
  }
  if (order.status !== 20) {
    return error(res, '当前订单状态不可接单', 400);
  }

  const nowStr = now();
  const acceptTxn = db.transaction(() => {
    db.prepare(`UPDATE \`order\` SET status = 30, rider_id = ?, rider_accept_time = ? WHERE id = ?`)
      .run(rider.id, nowStr, orderId);

    db.prepare(`INSERT INTO rider_delivery (order_id, rider_id, status, accept_time, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)`)
      .run(orderId, rider.id, nowStr, nowStr, nowStr);

    db.prepare(`UPDATE rider SET current_orders = current_orders + 1 WHERE id = ?`).run(rider.id);

    db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, 20, 30, ?, '骑手已接单')`)
      .run(orderId, 'rider');

    createMessage(order.user_id, 'order_dispatching', '订单配送中', `订单 ${order.order_no} 骑手已接单，正在配送`, orderId);
  });

  try {
    acceptTxn();
  } catch (e) {
    return error(res, '接单失败: ' + e.message, 500);
  }

  return success(res, { orderId, status: 30 }, '接单成功');
});

/**
 * POST /api/v1/rider/orders/:id/deliver
 * 骑手送达 (订单 30 → 40 已送达)
 */
router.post('/orders/:id/deliver', (req, res) => {
  const orderId = parseInt(req.params.id);
  const rider = getRider(req.userId);
  if (!rider) {
    return error(res, '骑手信息不存在', 404);
  }

  const order = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(orderId);
  if (!order) {
    return error(res, '订单不存在', 404);
  }
  if (order.status !== 30) {
    return error(res, '当前订单状态不可送达', 400);
  }

  const nowStr = now();
  const deliverTxn = db.transaction(() => {
    db.prepare(`UPDATE \`order\` SET status = 40, delivered_time = ? WHERE id = ?`)
      .run(nowStr, orderId);

    db.prepare(`UPDATE rider_delivery SET status = 3, deliver_time = ?, updated_at = ? WHERE order_id = ? AND rider_id = ?`)
      .run(nowStr, nowStr, orderId, rider.id);

    db.prepare(`UPDATE rider SET current_orders = current_orders - 1 WHERE id = ? AND current_orders > 0`).run(rider.id);

    db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, 30, 40, ?, '骑手已送达')`)
      .run(orderId, 'rider');

    createMessage(order.user_id, 'order_delivered', '订单已送达', `订单 ${order.order_no} 已送达，请确认收货`, orderId);
  });

  try {
    deliverTxn();
  } catch (e) {
    return error(res, '送达确认失败: ' + e.message, 500);
  }

  return success(res, { orderId, status: 40 }, '已确认送达');
});

module.exports = router;

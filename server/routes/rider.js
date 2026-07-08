const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const { success, error, now } = require('../helpers');
const authMiddleware = require('../middleware/auth');
const { createMessage } = require('./messages');

router.use(authMiddleware);

function getRider(userId) {
  const rider = db.prepare(`SELECT * FROM rider WHERE id = ?`).get(userId);
  if (rider) return rider;
  const rider2 = db.prepare(`SELECT * FROM rider WHERE name IN (SELECT nick_name FROM user WHERE id = ?) OR phone IN (SELECT phone FROM user WHERE id = ?)`).get(userId, userId);
  if (rider2) return rider2;
  return db.prepare(`SELECT * FROM rider WHERE status = 1 ORDER BY id LIMIT 1`).get();
}

function getRiderWarehouses(riderId) {
  const rows = db.prepare(`
    SELECT w.id, w.name, w.address, w.latitude, w.longitude, w.city_id,
           rw.is_default, rw.status
    FROM rider_warehouse rw
    JOIN warehouse w ON w.id = rw.warehouse_id
    WHERE rw.rider_id = ? AND rw.status = 1 AND w.status = 1
    ORDER BY rw.is_default DESC, w.id ASC
  `).all(riderId);
  if (rows.length === 0) {
    const rider = db.prepare(`SELECT * FROM rider WHERE id = ?`).get(riderId);
    if (rider && rider.warehouse_id) {
      const wh = db.prepare(`SELECT * FROM warehouse WHERE id = ?`).get(rider.warehouse_id);
      if (wh) return [{ ...wh, is_default: 1, status: 1 }];
    }
  }
  return rows;
}

function getDefaultWarehouseId(riderId) {
  const warehouses = getRiderWarehouses(riderId);
  if (warehouses.length === 0) return null;
  const def = warehouses.find(w => w.is_default === 1);
  return def ? def.id : warehouses[0].id;
}

router.get('/profile', (req, res) => {
  const rider = getRider(req.userId);
  if (!rider) return error(res, '骑手信息不存在', 404);
  const warehouses = getRiderWarehouses(rider.id);
  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN rd.status = 2 THEN 1 ELSE 0 END) as delivering_count,
      SUM(CASE WHEN rd.status = 3 THEN 1 ELSE 0 END) as completed_count,
      COUNT(*) as total_count
    FROM rider_delivery rd
    WHERE rd.rider_id = ?
  `).get(rider.id);
  return success(res, {
    rider: {
      id: rider.id,
      name: rider.name,
      phone: rider.phone,
      status: rider.status,
      lat: rider.lat,
      lng: rider.lng,
      currentOrders: rider.current_orders,
      locationUpdatedAt: rider.location_updated_at,
    },
    warehouses,
    stats: {
      delivering: stats?.delivering_count || 0,
      completed: stats?.completed_count || 0,
      total: stats?.total_count || 0,
    },
  });
});

router.get('/warehouses', (req, res) => {
  const rider = getRider(req.userId);
  if (!rider) return error(res, '骑手信息不存在', 404);
  const warehouses = getRiderWarehouses(rider.id);
  return success(res, { list: warehouses });
});

router.get('/orders', (req, res) => {
  const rider = getRider(req.userId);
  if (!rider) return success(res, { list: [] });

  const { status, warehouse_id } = req.query;

  const whId = warehouse_id ? parseInt(warehouse_id) : getDefaultWarehouseId(rider.id);
  if (!whId) return success(res, { list: [] });

  let sql = `
    SELECT o.id, o.order_no, o.status, o.pay_amount, o.pay_time, o.rider_pick_time,
           o.address_snapshot, o.delivery_time_slot, o.remark,
           u.nick_name, u.phone as user_phone,
           c.name as community_name,
           w.name as warehouse_name, w.address as warehouse_address,
           w.latitude as warehouse_lat, w.longitude as warehouse_lng,
           rd.status as delivery_status, rd.accept_time, rd.pick_time, rd.deliver_time,
           rd.arrive_pick_time, rd.arrive_deliver_time, rd.distance
    FROM \`order\` o
    LEFT JOIN user u ON u.id = o.user_id
    LEFT JOIN community c ON c.id = o.community_id
    LEFT JOIN warehouse w ON w.id = o.warehouse_id
    LEFT JOIN rider_delivery rd ON rd.order_id = o.id AND rd.rider_id = ?
    WHERE o.status IN (20, 30, 40) AND o.warehouse_id = ?
  `;
  const params = [rider.id, whId];

  if (status) {
    const s = parseInt(status);
    if (s === 20) {
      sql += ` AND o.status = 20 AND (o.rider_id IS NULL OR o.rider_id = ?)`;
      params.push(rider.id);
    } else if (s === 25) {
      sql += ` AND o.status = 30 AND rd.status = 1`;
    } else if (s === 30) {
      sql += ` AND o.status = 30 AND rd.status = 2`;
    } else if (s === 40) {
      sql += ` AND o.status = 40`;
    } else {
      sql += ` AND o.status = ?`;
      params.push(s);
    }
  }

  sql += ` ORDER BY o.pay_time ASC`;

  const orders = db.prepare(sql).all(...params);

  const result = orders.map(o => {
    const items = db.prepare(`SELECT sku_name, spec_name, price, quantity FROM order_item WHERE order_id = ?`).all(o.id);
    let address = {};
    try { address = JSON.parse(o.address_snapshot || '{}'); } catch (e) {}

    let deliveryStatus = o.delivery_status;
    let statusText = '';
    if (o.status === 20) {
      statusText = '待接单';
      deliveryStatus = 0;
    } else if (o.status === 30) {
      if (o.delivery_status === 1) {
        statusText = '待取货';
      } else if (o.delivery_status === 2) {
        statusText = '配送中';
      } else {
        statusText = '配送中';
      }
    } else if (o.status === 40) {
      statusText = '已送达';
      deliveryStatus = 3;
    }

    return {
      id: o.id,
      orderNo: o.order_no,
      status: o.status,
      deliveryStatus: deliveryStatus,
      statusText,
      payAmount: o.pay_amount,
      payTime: o.pay_time,
      remark: o.remark,
      items,
      address,
      userName: o.nick_name,
      userPhone: o.user_phone,
      communityName: o.community_name,
      warehouse: {
        id: o.warehouse_id,
        name: o.warehouse_name,
        address: o.warehouse_address,
        lat: o.warehouse_lat,
        lng: o.warehouse_lng,
      },
      delivery: {
        acceptTime: o.accept_time,
        arrivePickTime: o.arrive_pick_time,
        pickTime: o.pick_time,
        arriveDeliverTime: o.arrive_deliver_time,
        deliverTime: o.deliver_time,
        distance: o.distance,
      },
    };
  });

  return success(res, { list: result, total: result.length, warehouseId: whId });
});

router.get('/orders/today-stats', (req, res) => {
  const rider = getRider(req.userId);
  if (!rider) return error(res, '骑手信息不存在', 404);

  const today = new Date().toISOString().split('T')[0];
  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN rd.status >= 1 THEN 1 ELSE 0 END) as accepted,
      SUM(CASE WHEN rd.status >= 2 THEN 1 ELSE 0 END) as picked,
      SUM(CASE WHEN rd.status >= 3 THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN rd.status >= 3 THEN rd.distance ELSE 0 END) as total_distance
    FROM rider_delivery rd
    WHERE rd.rider_id = ? AND DATE(rd.created_at) = ?
  `).get(rider.id, today);

  return success(res, {
    accepted: stats?.accepted || 0,
    picked: stats?.picked || 0,
    delivered: stats?.delivered || 0,
    totalDistance: stats?.total_distance || 0,
  });
});

router.post('/location', (req, res) => {
  const { lat, lng } = req.body;
  if (isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
    return error(res, '经纬度无效', 400);
  }
  const rider = getRider(req.userId);
  if (!rider) return error(res, '骑手信息不存在', 404);
  const nowStr = now();
  db.prepare(`UPDATE rider SET lat = ?, lng = ?, location_updated_at = ? WHERE id = ?`)
    .run(parseFloat(lat), parseFloat(lng), nowStr, rider.id);
  return success(res, { updated: true }, '位置已更新');
});

router.post('/orders/:id/accept', (req, res) => {
  const orderId = parseInt(req.params.id);
  const rider = getRider(req.userId);
  if (!rider) return error(res, '骑手信息不存在', 404);

  const order = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(orderId);
  if (!order) return error(res, '订单不存在', 404);
  if (order.status !== 20) return error(res, '当前订单状态不可接单', 400);
  if (order.rider_id && order.rider_id !== rider.id) {
    return error(res, '该订单已被其他骑手接单', 400);
  }

  const nowStr = now();
  const acceptTxn = db.transaction(() => {
    const cur = db.prepare(`SELECT status, rider_id FROM \`order\` WHERE id = ?`).get(orderId);
    if (!cur || cur.status !== 20) throw new Error('订单状态已变更');
    if (cur.rider_id && cur.rider_id !== rider.id) throw new Error('该订单已被其他骑手接单');

    db.prepare(`UPDATE \`order\` SET status = 30, rider_id = ?, rider_accept_time = ? WHERE id = ?`)
      .run(rider.id, nowStr, orderId);

    db.prepare(`INSERT INTO rider_delivery (order_id, rider_id, status, accept_time, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)`)
      .run(orderId, rider.id, nowStr, nowStr, nowStr);

    db.prepare(`UPDATE rider SET current_orders = current_orders + 1 WHERE id = ?`).run(rider.id);

    db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, 20, 30, ?, '骑手已接单，待取货')`)
      .run(orderId, 'rider');

    createMessage(order.user_id, 'order_dispatching', '订单配送中', `订单 ${order.order_no} 骑手已接单，正在前往取货`, orderId);
  });

  try {
    acceptTxn();
  } catch (e) {
    return error(res, '接单失败: ' + e.message, 500);
  }

  return success(res, { orderId, status: 30, deliveryStatus: 1 }, '接单成功');
});

router.post('/orders/:id/arrive-pick', (req, res) => {
  const orderId = parseInt(req.params.id);
  const rider = getRider(req.userId);
  if (!rider) return error(res, '骑手信息不存在', 404);

  const delivery = db.prepare(`SELECT * FROM rider_delivery WHERE order_id = ? AND rider_id = ?`).get(orderId, rider.id);
  if (!delivery) return error(res, '配送记录不存在', 404);
  if (delivery.status !== 1) return error(res, '当前状态不可到达取货点', 400);

  const nowStr = now();
  db.prepare(`UPDATE rider_delivery SET arrive_pick_time = ?, updated_at = ? WHERE id = ?`)
    .run(nowStr, nowStr, delivery.id);

  db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, 30, 30, ?, '骑手已到达取货点')`)
    .run(orderId, 'rider');

  return success(res, { orderId }, '已到达取货点');
});

router.post('/orders/:id/pick', (req, res) => {
  const orderId = parseInt(req.params.id);
  const rider = getRider(req.userId);
  if (!rider) return error(res, '骑手信息不存在', 404);

  const delivery = db.prepare(`SELECT * FROM rider_delivery WHERE order_id = ? AND rider_id = ?`).get(orderId, rider.id);
  if (!delivery) return error(res, '配送记录不存在', 404);
  if (delivery.status !== 1) return error(res, '当前状态不可取货', 400);

  const order = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(orderId);
  if (!order) return error(res, '订单不存在', 404);

  const nowStr = now();
  const pickTxn = db.transaction(() => {
    db.prepare(`UPDATE rider_delivery SET status = 2, pick_time = ?, updated_at = ? WHERE id = ?`)
      .run(nowStr, nowStr, delivery.id);

    db.prepare(`UPDATE \`order\` SET rider_pick_time = ? WHERE id = ?`)
      .run(nowStr, orderId);

    db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, 30, 30, ?, '骑手已取货，正在配送')`)
      .run(orderId, 'rider');

    createMessage(order.user_id, 'order_picked', '骑手已取货', `订单 ${order.order_no} 骑手已取货，正在配送途中`, orderId);
  });

  try {
    pickTxn();
  } catch (e) {
    return error(res, '取货失败: ' + e.message, 500);
  }

  return success(res, { orderId, deliveryStatus: 2 }, '取货成功');
});

router.post('/orders/:id/arrive-deliver', (req, res) => {
  const orderId = parseInt(req.params.id);
  const rider = getRider(req.userId);
  if (!rider) return error(res, '骑手信息不存在', 404);

  const delivery = db.prepare(`SELECT * FROM rider_delivery WHERE order_id = ? AND rider_id = ?`).get(orderId, rider.id);
  if (!delivery) return error(res, '配送记录不存在', 404);
  if (delivery.status !== 2) return error(res, '当前状态不可到达收货点', 400);

  const nowStr = now();
  db.prepare(`UPDATE rider_delivery SET arrive_deliver_time = ?, updated_at = ? WHERE id = ?`)
    .run(nowStr, nowStr, delivery.id);

  return success(res, { orderId }, '已到达收货点');
});

router.post('/orders/:id/deliver', (req, res) => {
  const orderId = parseInt(req.params.id);
  const rider = getRider(req.userId);
  if (!rider) return error(res, '骑手信息不存在', 404);

  const order = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(orderId);
  if (!order) return error(res, '订单不存在', 404);
  if (order.status !== 30) return error(res, '当前订单状态不可送达', 400);
  if (order.rider_id && order.rider_id !== rider.id) {
    return error(res, '该订单非您配送，不可操作', 400);
  }

  const delivery = db.prepare(`SELECT * FROM rider_delivery WHERE order_id = ? AND rider_id = ?`).get(orderId, rider.id);

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

  return success(res, { orderId, status: 40, deliveryStatus: 3 }, '已确认送达');
});

// 上下线状态切换
router.post('/status', (req, res) => {
  const { status } = req.body;
  if (status !== 0 && status !== 1) return error(res, '状态值无效', 400);
  const rider = getRider(req.userId);
  if (!rider) return error(res, '骑手信息不存在', 404);
  db.prepare(`UPDATE rider SET status = ?, updated_at = ? WHERE id = ?`).run(status, now(), rider.id);
  return success(res, { status }, status === 1 ? '已上线' : '已下线');
});

// 订单详情
router.get('/orders/:id', (req, res) => {
  const orderId = parseInt(req.params.id);
  const rider = getRider(req.userId);
  if (!rider) return error(res, '骑手信息不存在', 404);

  const o = db.prepare(`
    SELECT o.*, u.nick_name, u.phone as user_phone, c.name as community_name,
           w.name as warehouse_name, w.address as warehouse_address,
           w.latitude as warehouse_lat, w.longitude as warehouse_lng
    FROM \`order\` o
    LEFT JOIN user u ON u.id = o.user_id
    LEFT JOIN community c ON c.id = o.community_id
    LEFT JOIN warehouse w ON w.id = o.warehouse_id
    WHERE o.id = ?
  `).get(orderId);
  if (!o) return error(res, '订单不存在', 404);

  const items = db.prepare(`SELECT sku_name, spec_name, price, quantity FROM order_item WHERE order_id = ?`).all(orderId);
  const delivery = db.prepare(`SELECT * FROM rider_delivery WHERE order_id = ? AND rider_id = ?`).get(orderId, rider.id);
  let address = {};
  try { address = JSON.parse(o.address_snapshot || '{}'); } catch (e) {}

  let statusText = '';
  let deliveryStatus = delivery?.status || 0;
  if (o.status === 20) { statusText = '待接单'; deliveryStatus = 0; }
  else if (o.status === 30) {
    if (deliveryStatus === 1) statusText = '待取货';
    else if (deliveryStatus === 2) statusText = '配送中';
    else statusText = '配送中';
  } else if (o.status === 40) { statusText = '已送达'; deliveryStatus = 3; }
  else if (o.status === 50) { statusText = '已完成'; deliveryStatus = 3; }

  return success(res, {
    order: {
      id: o.id,
      orderNo: o.order_no,
      status: o.status,
      deliveryStatus,
      statusText,
      payAmount: o.pay_amount,
      payTime: o.pay_time,
      remark: o.remark,
      items,
      address,
      userName: o.nick_name,
      userPhone: o.user_phone,
      communityName: o.community_name,
      warehouse: { id: o.warehouse_id, name: o.warehouse_name, address: o.warehouse_address, lat: o.warehouse_lat, lng: o.warehouse_lng },
      delivery: delivery ? {
        acceptTime: delivery.accept_time,
        arrivePickTime: delivery.arrive_pick_time,
        pickTime: delivery.pick_time,
        arriveDeliverTime: delivery.arrive_deliver_time,
        deliverTime: delivery.deliver_time,
        distance: delivery.distance,
      } : null,
    }
  });
});

// 收入明细
router.get('/income', (req, res) => {
  const rider = getRider(req.userId);
  if (!rider) return error(res, '骑手信息不存在', 404);
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.page_size) || 20;
  const offset = (page - 1) * pageSize;

  const totalRow = db.prepare(`
    SELECT COUNT(*) as total, COALESCE(SUM(o.pay_amount * 0.15), 0) as total_income
    FROM rider_delivery rd
    JOIN \`order\` o ON o.id = rd.order_id
    WHERE rd.rider_id = ? AND rd.status = 3
  `).get(rider.id);

  const rows = db.prepare(`
    SELECT rd.deliver_time, rd.distance, o.order_no, o.pay_amount,
           (o.pay_amount * 0.15) as income
    FROM rider_delivery rd
    JOIN \`order\` o ON o.id = rd.order_id
    WHERE rd.rider_id = ? AND rd.status = 3
    ORDER BY rd.deliver_time DESC
    LIMIT ? OFFSET ?
  `).all(rider.id, pageSize, offset);

  const list = rows.map(r => ({
    orderNo: r.order_no,
    title: '配送收入',
    amount: Math.round(r.income * 100) / 100,
    time: r.deliver_time,
    distance: r.distance,
  }));

  return success(res, {
    list,
    total: totalRow.total,
    totalIncome: Math.round(totalRow.total_income * 100) / 100,
    page,
    pageSize,
  });
});

// 配送统计
router.get('/stats', (req, res) => {
  const rider = getRider(req.userId);
  if (!rider) return error(res, '骑手信息不存在', 404);
  const days = parseInt(req.query.days) || 7;

  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN rd.status >= 3 THEN 1 ELSE 0 END) as total_delivered,
      SUM(CASE WHEN rd.status >= 3 THEN rd.distance ELSE 0 END) as total_distance,
      SUM(CASE WHEN rd.status >= 3 THEN o.pay_amount * 0.15 ELSE 0 END) as total_income
    FROM rider_delivery rd
    JOIN \`order\` o ON o.id = rd.order_id
    WHERE rd.rider_id = ? AND DATE(rd.created_at) >= DATE('now', '-' || ? || ' days')
  `).get(rider.id, days);

  const dailyRows = db.prepare(`
    SELECT
      DATE(rd.created_at) as date,
      SUM(CASE WHEN rd.status >= 3 THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN rd.status >= 3 THEN rd.distance ELSE 0 END) as distance,
      SUM(CASE WHEN rd.status >= 3 THEN o.pay_amount * 0.15 ELSE 0 END) as income
    FROM rider_delivery rd
    JOIN \`order\` o ON o.id = rd.order_id
    WHERE rd.rider_id = ? AND DATE(rd.created_at) >= DATE('now', '-' || ? || ' days')
    GROUP BY DATE(rd.created_at)
    ORDER BY date DESC
  `).all(rider.id, days);

  const totalDelivered = totals?.total_delivered || 0;
  const avgPerDay = days > 0 ? totalDelivered / days : 0;

  return success(res, {
    totalDelivered,
    totalDistance: Math.round((totals?.total_distance || 0) * 10) / 10,
    totalIncome: Math.round((totals?.total_income || 0) * 100) / 100,
    avgPerDay: Math.round(avgPerDay * 10) / 10,
    daily: dailyRows.map(r => ({
      date: r.date,
      delivered: r.delivered || 0,
      distance: Math.round((r.distance || 0) * 10) / 10,
      income: Math.round((r.income || 0) * 100) / 100,
    })),
  });
});

module.exports = router;

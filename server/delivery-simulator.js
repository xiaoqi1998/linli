/**
 * 演示模式: 自动模拟配送流程
 * 支付成功后 3 秒自动派单 (20→30)，再 3 秒送达 (30→40)，再 3 秒自动确认收货 (40→50)
 * 原本的团长派单/骑手接单/送达/确认接口仍然可用，本模块仅在演示环境下自动推进
 *
 * 三阶段独立函数:
 *   - dispatchOrder    20 → 30 (派单)
 *   - deliverOrder     30 → 40 (送达)
 *   - confirmOrder     40 → 50 (完成 + 结算佣金)
 * simulateDeliveryFlow 串联三阶段; resumeDeliveryFlow 根据当前状态从中断点继续
 */
const db = require('./db');
const { now } = require('./helpers');
const { createMessage } = require('./routes/messages');
const { settleCommissionForOrder } = require('./scheduler');

/**
 * 派单: 20 → 30
 */
function dispatchOrder(orderId) {
  try {
    const order = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(orderId);
    if (!order || order.status !== 20) return false;

    const rider = db.prepare(`
      SELECT * FROM rider WHERE warehouse_id = ? AND status = 1
      ORDER BY current_orders ASC, id ASC LIMIT 1
    `).get(order.warehouse_id) || db.prepare(`SELECT * FROM rider ORDER BY id LIMIT 1`).get();

    if (!rider) {
      console.error('[Demo] 无可用骑手，跳过自动派单');
      return false;
    }

    const nowStr = now();
    const dispatchTxn = db.transaction(() => {
      db.prepare(`UPDATE \`order\` SET status = 30, rider_id = ?, rider_accept_time = ? WHERE id = ?`)
        .run(rider.id, nowStr, orderId);

      db.prepare(`INSERT INTO rider_delivery (order_id, rider_id, status, accept_time, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)`)
        .run(orderId, rider.id, nowStr, nowStr, nowStr);

      db.prepare(`UPDATE rider SET current_orders = current_orders + 1 WHERE id = ?`).run(rider.id);

      db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, 20, 30, ?, '演示模式: 自动派单')`)
        .run(orderId, 'system');

      createMessage(order.user_id, 'order_dispatching', '订单配送中', `订单 ${order.order_no} 骑手已接单，正在配送`, orderId);
    });
    dispatchTxn();
    console.log(`[Demo] 订单 ${order.order_no} 已自动派单 (20→30)`);

    // 演示: 模拟骑手沿路径移动 (3 秒内逐步更新位置, 让用户端能查到实时位置)
    simulateRiderMovement(order, rider);
    return true;
  } catch (e) {
    console.error('[Demo] 自动派单失败:', e.message);
    return false;
  }
}

/**
 * 送达: 30 → 40
 */
function deliverOrder(orderId) {
  try {
    const ord = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(orderId);
    if (!ord || ord.status !== 30) return false;

    const t = now();
    const deliverTxn = db.transaction(() => {
      db.prepare(`UPDATE \`order\` SET status = 40, delivered_time = ? WHERE id = ?`).run(t, orderId);

      if (ord.rider_id) {
        db.prepare(`UPDATE rider_delivery SET status = 3, deliver_time = ?, updated_at = ? WHERE order_id = ? AND rider_id = ?`)
          .run(t, t, orderId, ord.rider_id);
        db.prepare(`UPDATE rider SET current_orders = current_orders - 1 WHERE id = ? AND current_orders > 0`).run(ord.rider_id);
      }

      db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, 30, 40, ?, '演示模式: 自动送达')`)
        .run(orderId, 'system');

      createMessage(ord.user_id, 'order_delivered', '订单已送达', `订单 ${ord.order_no} 已送达，请确认收货`, orderId);
    });
    deliverTxn();
    console.log(`[Demo] 订单 ${ord.order_no} 已自动送达 (30→40)`);
    return true;
  } catch (e) {
    console.error('[Demo] 自动送达失败:', e.message);
    return false;
  }
}

/**
 * 完成收货: 40 → 50 + 结算佣金
 */
function confirmOrder(orderId) {
  try {
    const o = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(orderId);
    if (!o || o.status !== 40) return false;

    const tt = now();
    const confirmTxn = db.transaction(() => {
      db.prepare(`UPDATE \`order\` SET status = 50, completed_time = ?, auto_confirm_time = ? WHERE id = ?`).run(tt, tt, orderId);

      db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, 40, 50, ?, '演示模式: 自动确认收货')`)
        .run(orderId, 'system');

      createMessage(o.user_id, 'order_completed', '订单已完成', `订单 ${o.order_no} 已完成，感谢您的惠顾`, orderId);

      settleCommissionForOrder(o);
    });
    confirmTxn();
    console.log(`[Demo] 订单 ${o.order_no} 已自动完成 (40→50)`);
    return true;
  } catch (e) {
    console.error('[Demo] 自动确认收货失败:', e.message);
    return false;
  }
}

/**
 * 演示模式: 完整配送流程 (20→30→40→50)
 * 支付成功后 6 秒派单, 18 秒后送达(期间骑手沿路径移动), 6 秒后自动确认收货
 * 总时长约30秒, 给用户足够时间在订单详情页观察骑手移动
 */
function simulateDeliveryFlow(orderId) {
  setTimeout(() => {
    if (!dispatchOrder(orderId)) return;
    // 18 秒后送达 (骑手18秒移动时间)
    setTimeout(() => {
      if (!deliverOrder(orderId)) return;
      // 6 秒后自动确认收货 + 结算佣金
      setTimeout(() => {
        confirmOrder(orderId);
      }, 6000);
    }, 18000);
  }, 6000);
}

/**
 * 恢复中断的配送流程 (进程重启时调用)
 * 根据订单当前状态从中断点继续推进
 */
function resumeDeliveryFlow(orderId) {
  try {
    const order = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(orderId);
    if (!order) return;

    if (order.status === 20) {
      // 已支付未派单: 重新启动完整流程
      console.log(`[Demo] 恢复订单 ${order.order_no} 配送流程 (从 20 开始)`);
      simulateDeliveryFlow(orderId);
    } else if (order.status === 30) {
      // 已派单未送达: 10 秒后送达 → 再 6 秒确认
      console.log(`[Demo] 恢复订单 ${order.order_no} 配送流程 (从 30 开始)`);
      setTimeout(() => {
        if (!deliverOrder(orderId)) return;
        setTimeout(() => confirmOrder(orderId), 6000);
      }, 10000);
    } else if (order.status === 40) {
      // 已送达未确认: 6 秒后确认收货
      console.log(`[Demo] 恢复订单 ${order.order_no} 配送流程 (从 40 开始)`);
      setTimeout(() => confirmOrder(orderId), 6000);
    }
  } catch (e) {
    console.error('[Demo] resumeDeliveryFlow error:', e.message);
  }
}

/**
 * 启动时扫描所有中断的配送订单并恢复
 */
function resumeIncompleteDeliveries() {
  try {
    const orders = db.prepare(`
      SELECT id, order_no, status FROM \`order\`
      WHERE status IN (20, 30, 40) AND pay_status = 1
      ORDER BY id ASC
    `).all();

    if (orders.length === 0) return;

    console.log(`[Demo] 发现 ${orders.length} 个中断的配送订单, 开始恢复...`);
    for (const o of orders) {
      resumeDeliveryFlow(o.id);
    }
  } catch (e) {
    console.error('[Demo] resumeIncompleteDeliveries error:', e.message);
  }
}

/**
 * 演示: 模拟骑手沿路径从起点移动到终点 (18 秒内分 18 次更新位置, 每秒1步)
 * 让用户端查询 rider-location 能看到位置变化
 */
function simulateRiderMovement(order, rider) {
  // 起点: 前置仓/骑手当前位置; 终点: 收货地址
  const startLat = rider.lat || 22.5400;
  const startLng = rider.lng || 113.9450;

  let destLat = null;
  let destLng = null;
  try {
    const snap = JSON.parse(order.address_snapshot || '{}');
    if (snap.latitude && snap.longitude) {
      destLat = snap.latitude;
      destLng = snap.longitude;
    }
  } catch (e) {}
  if (!destLat || !destLng) {
    // fallback: 使用社区坐标
    const community = db.prepare(`SELECT latitude, longitude FROM community WHERE id = ?`).get(order.community_id);
    if (community) {
      destLat = community.latitude;
      destLng = community.longitude;
    } else {
      destLat = startLat + 0.001;
      destLng = startLng + 0.001;
    }
  }

  // 与 deliverOrder 的超时时间一致: 18秒, 每秒更新1次位置
  const steps = 18;
  const intervalMs = 1000; // 1 秒一次, 共 18 秒
  let step = 0;
  const timer = setInterval(() => {
    step++;
    const t = step / steps;
    // 添加微小波动模拟真实路径 (不是笔直的直线)
    const wobble = Math.sin(step * 0.8) * 0.0003;
    const lat = startLat + (destLat - startLat) * t + wobble;
    const lng = startLng + (destLng - startLng) * t + wobble * 0.5;
    try {
      db.prepare(`UPDATE rider SET lat = ?, lng = ?, location_updated_at = ? WHERE id = ?`)
        .run(lat, lng, now(), rider.id);
    } catch (e) {
      // 忽略
    }
    if (step >= steps) clearInterval(timer);
  }, intervalMs);
}

module.exports = {
  simulateDeliveryFlow,
  resumeDeliveryFlow,
  resumeIncompleteDeliveries,
  dispatchOrder,
  deliverOrder,
  confirmOrder,
};

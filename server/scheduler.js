/**
 * 邻里鲜生 · 定时任务调度器
 * Demo 版: 使用 setInterval 实现简单的定时任务
 */
const db = require('./db');
const { now, generateWithdrawNo } = require('./helpers');
const { createMessage } = require('./routes/messages');

/**
 * 1. 订单超时取消 (每 60 秒执行)
 * 取消超过 15 分钟未支付的订单 (status=10, expire_at < now)
 */
function cancelExpiredOrders() {
  try {
    const nowStr = now();
    const expiredOrders = db.prepare(`
      SELECT * FROM \`order\` WHERE status = 10 AND expire_at < ?
    `).all(nowStr);

    if (expiredOrders.length === 0) return;

    const cancelTxn = db.transaction(() => {
      for (const order of expiredOrders) {
        db.prepare(`UPDATE \`order\` SET status = 99, cancel_time = ?, cancel_reason = ? WHERE id = ?`)
          .run(nowStr, '超时未支付自动取消', order.id);

        // 释放锁定库存
        const items = db.prepare(`SELECT * FROM order_item WHERE order_id = ?`).all(order.id);
        const updateInv = db.prepare(`UPDATE inventory SET locked_stock = locked_stock - ?, available_stock = available_stock + ? WHERE warehouse_id = ? AND sku_id = ?`);
        for (const item of items) {
          updateInv.run(item.quantity, item.quantity, order.warehouse_id, item.sku_id);
        }

        // 返还优惠券
        if (order.coupon_id) {
          db.prepare(`UPDATE user_coupon SET status = 0, used_order_id = NULL WHERE id = ?`).run(order.coupon_id);
        }

        db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, 10, 99, ?, '超时自动取消')`)
          .run(order.id, 'system');

        createMessage(order.user_id, 'order_cancelled', '订单已取消', `订单 ${order.order_no} 超时未支付，已自动取消`, order.id);
      }
    });

    try {
      cancelTxn();
      if (expiredOrders.length > 0) {
        console.log(`[Scheduler] 取消 ${expiredOrders.length} 个超时订单`);
      }
    } catch (e) {
      console.error('[Scheduler] cancelExpiredOrders error:', e.message);
    }
  } catch (e) {
    console.error('[Scheduler] cancelExpiredOrders error:', e.message);
  }
}

/**
 * 2. 自动确认收货 (每 60 秒执行)
 * 已送达超过 7 天的订单自动确认收货 (status=40)
 * Demo: 为加速演示，delivered_time 超过 30 分钟即自动确认
 */
function autoConfirmOrders() {
  try {
    const orders = db.prepare(`
      SELECT * FROM \`order\` WHERE status = 40 AND delivered_time IS NOT NULL
    `).all();

    const nowMs = Date.now();
    const toConfirm = orders.filter(o => {
      if (!o.delivered_time) return false;
      const deliveredMs = new Date(o.delivered_time.replace(' ', 'T') + 'Z').getTime();
      // Demo: 30 分钟自动确认 (正式环境应为 7 天 = 7 * 24 * 60 * 60 * 1000)
      return (nowMs - deliveredMs) > 30 * 60 * 1000;
    });

    if (toConfirm.length === 0) return;

    const nowStr = now();
    const confirmTxn = db.transaction(() => {
      for (const order of toConfirm) {
        db.prepare(`UPDATE \`order\` SET status = 50, completed_time = ?, auto_confirm_time = ? WHERE id = ?`)
          .run(nowStr, nowStr, order.id);

        db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, 40, 50, ?, '超时自动确认')`)
          .run(order.id, 'system');

        createMessage(order.user_id, 'order_completed', '订单已自动完成', `订单 ${order.order_no} 已自动确认收货`, order.id);

        // 结算佣金
        settleCommissionForOrder(order);
      }
    });

    try {
      confirmTxn();
      if (toConfirm.length > 0) {
        console.log(`[Scheduler] 自动确认 ${toConfirm.length} 个订单`);
      }
    } catch (e) {
      console.error('[Scheduler] autoConfirmOrders error:', e.message);
    }
  } catch (e) {
    console.error('[Scheduler] autoConfirmOrders error:', e.message);
  }
}

/**
 * 3. 佣金结算 (完成订单时调用 + 每小时批量检查)
 * 已完成订单且未结算佣金的订单，结算佣金到团长账户
 */
function settleCommissionForOrder(order) {
  try {
    if (!order.leader_id) return;

    // 重新查询最新状态，避免重复结算 (幂等性)
    const latestOrder = db.prepare(`SELECT commission_settled FROM \`order\` WHERE id = ?`).get(order.id);
    if (!latestOrder || latestOrder.commission_settled === 1) return;

    // 检查是否已有结算记录
    const existing = db.prepare(`SELECT id FROM commission_settlement WHERE order_id = ?`).get(order.id);
    if (existing) {
      db.prepare(`UPDATE \`order\` SET commission_settled = 1 WHERE id = ?`).run(order.id);
      return;
    }

    const items = db.prepare(`SELECT * FROM order_item WHERE order_id = ?`).all(order.id);
    let totalCommission = 0;
    for (const item of items) {
      const itemCommission = parseFloat((item.price * item.quantity * (item.commission_rate || 8) / 100).toFixed(2));
      totalCommission += itemCommission;
    }

    if (totalCommission > 0) {
      const settleTxn = db.transaction(() => {
        db.prepare(`INSERT INTO commission_settlement (leader_id, order_id, amount, status, settled_at, created_at) VALUES (?, ?, ?, 1, ?, ?)`)
          .run(order.leader_id, order.id, totalCommission, now(), now());

        db.prepare(`UPDATE leader SET total_commission = total_commission + ?, withdrawable_commission = withdrawable_commission + ? WHERE id = ?`)
          .run(totalCommission, totalCommission, order.leader_id);

        db.prepare(`UPDATE \`order\` SET commission_settled = 1, commission_amount = ? WHERE id = ? AND commission_settled = 0`)
          .run(totalCommission, order.id);
      });

      try {
        settleTxn();
        const leader = db.prepare(`SELECT user_id FROM leader WHERE id = ?`).get(order.leader_id);
        if (leader) {
          createMessage(leader.user_id, 'commission_settled', '佣金到账', `订单 ${order.order_no} 佣金 ¥${totalCommission.toFixed(2)} 已到账`, order.id);
        }
      } catch (e) {
        // 并发冲突时忽略
      }
    } else {
      db.prepare(`UPDATE \`order\` SET commission_settled = 1 WHERE id = ?`).run(order.id);
    }
  } catch (e) {
    console.error('[Scheduler] settleCommissionForOrder error:', e.message);
  }
}

function settlePendingCommissions() {
  try {
    const orders = db.prepare(`SELECT * FROM \`order\` WHERE status = 50 AND commission_settled = 0 AND leader_id IS NOT NULL`).all();
    for (const order of orders) {
      settleCommissionForOrder(order);
    }
    if (orders.length > 0) {
      console.log(`[Scheduler] 结算 ${orders.length} 个订单佣金`);
    }
  } catch (e) {
    console.error('[Scheduler] settlePendingCommissions error:', e.message);
  }
}

/**
 * 4. 拼团超时退款 (每 60 秒执行)
 * 拼团超时未成团的订单自动取消并退款
 */
function cancelExpiredGroupBuys() {
  try {
    const nowStr = now();
    const expiredGroupBuys = db.prepare(`
      SELECT * FROM group_buy WHERE status = 1 AND expire_at < ?
    `).all(nowStr);

    if (expiredGroupBuys.length === 0) return;

    for (const gb of expiredGroupBuys) {
      const participants = db.prepare(`
        SELECT gbp.*, o.id as order_id, o.order_no, o.status as order_status, o.pay_status, o.user_id
        FROM group_buy_participant gbp
        LEFT JOIN \`order\` o ON o.id = gbp.order_id
        WHERE gbp.group_buy_id = ? AND gbp.status = 1
      `).all(gb.id);

      const refundTxn = db.transaction(() => {
        // 标记拼团失败
        db.prepare(`UPDATE group_buy SET status = 3, updated_at = ? WHERE id = ?`).run(nowStr, gb.id);

        for (const p of participants) {
          if (!p.order_id) continue;

          const order = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(p.order_id);

          if (order.status === 10) {
            // 未支付，直接取消
            db.prepare(`UPDATE \`order\` SET status = 99, cancel_time = ?, cancel_reason = ? WHERE id = ?`)
              .run(nowStr, '拼团超时未成团', order.id);

            const items = db.prepare(`SELECT * FROM order_item WHERE order_id = ?`).all(order.id);
            const updateInv = db.prepare(`UPDATE inventory SET locked_stock = locked_stock - ?, available_stock = available_stock + ? WHERE warehouse_id = ? AND sku_id = ?`);
            for (const item of items) {
              updateInv.run(item.quantity, item.quantity, order.warehouse_id, item.sku_id);
            }

            createMessage(order.user_id, 'group_buy_failed', '拼团未成功', `拼团未在规定时间内成团，订单 ${order.order_no} 已取消`, order.id);
          } else if (order.pay_status === 1 && order.status !== 99) {
            // 已支付，退款
            db.prepare(`UPDATE \`order\` SET status = 99, cancel_time = ?, cancel_reason = ? WHERE id = ?`)
              .run(nowStr, '拼团超时未成团，已退款', order.id);

            // 库存回补
            const items = db.prepare(`SELECT * FROM order_item WHERE order_id = ?`).all(order.id);
            const updateInv = db.prepare(`UPDATE inventory SET available_stock = available_stock + ? WHERE warehouse_id = ? AND sku_id = ?`);
            for (const item of items) {
              updateInv.run(item.quantity, order.warehouse_id, item.sku_id);
            }

            // 记录退款
            db.prepare(`INSERT INTO refund (order_id, user_id, amount, reason, status, leader_id, created_at, updated_at) VALUES (?, ?, ?, ?, 2, ?, ?, ?)`)
              .run(order.id, order.user_id, order.pay_amount, '拼团超时未成团自动退款', order.leader_id, nowStr, nowStr);

            createMessage(order.user_id, 'group_buy_refund', '拼团退款', `拼团未成功，订单 ${order.order_no} 已退款 ¥${order.pay_amount.toFixed(2)}`, order.id);
          }

          db.prepare(`UPDATE group_buy_participant SET status = 0 WHERE id = ?`).run(p.id);
        }
      });

      try {
        refundTxn();
        console.log(`[Scheduler] 拼团 ${gb.id} 超时，处理 ${participants.length} 个参与者`);
      } catch (e) {
        console.error('[Scheduler] cancelExpiredGroupBuys error:', e.message);
      }
    }
  } catch (e) {
    console.error('[Scheduler] cancelExpiredGroupBuys error:', e.message);
  }
}

/**
 * 5. 优惠券过期处理 (每 60 秒执行)
 */
function expireCoupons() {
  try {
    const nowStr = now();
    const result = db.prepare(`UPDATE user_coupon SET status = 2 WHERE status = 0 AND valid_end IS NOT NULL AND valid_end < ?`).run(nowStr);
    if (result.changes > 0) {
      console.log(`[Scheduler] 过期 ${result.changes} 张优惠券`);
    }
  } catch (e) {
    console.error('[Scheduler] expireCoupons error:', e.message);
  }
}

/**
 * 启动所有定时任务
 */
function startScheduler() {
  console.log('[Scheduler] 定时任务调度器已启动');

  // 每 60 秒执行一次所有任务
  setInterval(() => {
    cancelExpiredOrders();
    autoConfirmOrders();
    cancelExpiredGroupBuys();
    expireCoupons();
  }, 60 * 1000);

  // 每 5 分钟结算佣金
  setInterval(() => {
    settlePendingCommissions();
  }, 5 * 60 * 1000);

  // 启动时立即执行一次
  setTimeout(() => {
    cancelExpiredOrders();
    cancelExpiredGroupBuys();
    expireCoupons();
    settlePendingCommissions();
  }, 3000);
}

module.exports = {
  startScheduler,
  settleCommissionForOrder,
  cancelExpiredOrders,
  autoConfirmOrders,
  cancelExpiredGroupBuys,
  expireCoupons,
  settlePendingCommissions,
};

/**
 * 邻里鲜生 · 定时任务调度器
 * Demo 版: 使用 setInterval 实现简单的定时任务
 */
const db = require('./db');
const { now, generateWithdrawNo } = require('./helpers');
const { createMessage } = require('./routes/messages');

/**
 * 统一退款处理: 订单标记退款 + 库存回补 + 还原用户消费额/积分/会员等级
 * @param {object} order - 订单对象 (必须包含 id, user_id, pay_amount, warehouse_id, status, leader_id)
 * @param {string} reason - 退款原因
 * @param {string} operator - 操作方 (system / leader / user)
 * @param {number|null} refundStatus - refund 记录的 status: 1=已同意退款(默认), 3=自动退款
 * @returns {boolean} 是否成功
 */
function processOrderRefund(order, reason, operator = 'system', refundStatus = 1) {
  if (!order || !order.id) return false;
  const nowStr = now();
  const items = db.prepare(`SELECT * FROM order_item WHERE order_id = ?`).all(order.id);
  const earnedPoints = Math.floor(order.pay_amount);
  const user = db.prepare(`SELECT points, total_consume, member_level, order_count FROM user WHERE id = ?`).get(order.user_id);

  const txn = db.transaction(() => {
    // 1. 订单标记为已取消 + 已退款
    db.prepare(`UPDATE \`order\` SET status = 99, pay_status = 2, cancel_time = ?, cancel_reason = ? WHERE id = ?`)
      .run(nowStr, reason, order.id);

    // 2. 库存回补 (已支付订单库存已从 available 扣减, 退款时加回)
    const updateInv = db.prepare(`UPDATE inventory SET available_stock = available_stock + ? WHERE warehouse_id = ? AND sku_id = ?`);
    for (const item of items) {
      updateInv.run(item.quantity, order.warehouse_id, item.sku_id);
    }

    // 3. 商品销量回退
    const updateSales = db.prepare(`UPDATE sku SET sales_count = MAX(0, sales_count - ?) WHERE id = ?`);
    for (const item of items) {
      updateSales.run(item.quantity, item.sku_id);
    }

    // 4. 还原用户消费额/订单数/积分 (积分不能小于 0)
    if (user) {
      const newPoints = Math.max(0, user.points - earnedPoints);
      const newTotalConsume = Math.max(0, user.total_consume - order.pay_amount);
      const newOrderCount = Math.max(0, user.order_count - 1);

      // 重新计算会员等级 (降级)
      let newLevel = 1;
      if (newTotalConsume >= 999) newLevel = 3;
      else if (newTotalConsume >= 199) newLevel = 2;

      db.prepare(`UPDATE user SET total_consume = ?, order_count = ?, points = ?, member_level = ? WHERE id = ?`)
        .run(newTotalConsume, newOrderCount, newPoints, newLevel, order.user_id);

      // 记录积分退还流水 (type=2 表示消费退还)
      if (earnedPoints > 0) {
        db.prepare(`INSERT INTO point_transaction (user_id, type, points, balance, remark, order_id) VALUES (?, 2, ?, ?, '订单退款扣除', ?)`)
          .run(order.user_id, -earnedPoints, newPoints, order.id);
      }
    }

    // 5. 记录退款单
    db.prepare(`INSERT INTO refund (order_id, user_id, amount, reason, status, leader_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(order.id, order.user_id, order.pay_amount, reason, refundStatus, order.leader_id, nowStr, nowStr);

    // 6. 订单状态日志
    db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, ?, 99, ?, ?)`)
      .run(order.id, order.status, operator, reason);

    // 7. 通知用户
    createMessage(order.user_id, 'refund_approved', '退款已处理', `订单 ${order.order_no} 已退款 ¥${order.pay_amount.toFixed(2)}`, order.id);
  });

  try {
    txn();
    return true;
  } catch (e) {
    console.error('[Scheduler] processOrderRefund error:', e.message);
    return false;
  }
}

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

        // 释放锁定库存 (locked_stock 不能小于 0)
        const items = db.prepare(`SELECT * FROM order_item WHERE order_id = ?`).all(order.id);
        const updateInv = db.prepare(`UPDATE inventory SET locked_stock = MAX(0, locked_stock - ?), available_stock = available_stock + ? WHERE warehouse_id = ? AND sku_id = ?`);
        for (const item of items) {
          updateInv.run(item.quantity, item.quantity, order.warehouse_id, item.sku_id);
        }

        // 返还优惠券
        if (order.coupon_id) {
          db.prepare(`UPDATE user_coupon SET status = 0, used_order_id = NULL WHERE id = ?`).run(order.coupon_id);
        }

        // 拼团订单: 回退 joined_count + 标记 participant 失效
        if (order.group_buy_id) {
          db.prepare(`UPDATE group_buy SET joined_count = MAX(0, joined_count - 1), updated_at = ? WHERE id = ? AND status = 1`)
            .run(nowStr, order.group_buy_id);
          db.prepare(`UPDATE group_buy_participant SET status = 0 WHERE order_id = ?`)
            .run(order.id);
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
            // 已支付，统一退款处理 (还原积分/会员等级/消费额, pay_status=2, refund.status=3 自动退款)
            db.prepare(`UPDATE group_buy_participant SET status = 0 WHERE id = ?`).run(p.id);
            continue; // 跳过下面的 participant 状态更新, processOrderRefund 会处理
          }

          db.prepare(`UPDATE group_buy_participant SET status = 0 WHERE id = ?`).run(p.id);
        }
      });

      try {
        refundTxn();
        // 事务提交后, 对已支付订单执行统一退款 (含还原积分/会员等级等)
        for (const p of participants) {
          if (!p.order_id) continue;
          const order = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(p.order_id);
          if (order.pay_status === 1 && order.status !== 99) {
            processOrderRefund(order, '拼团超时未成团自动退款', 'system', 3);
            createMessage(order.user_id, 'group_buy_refund', '拼团退款', `拼团未成功，订单 ${order.order_no} 已退款 ¥${order.pay_amount.toFixed(2)}`, order.id);
          }
        }
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

    // 恢复中断的演示配送流程 (进程重启后 setTimeout 丢失的订单)
    try {
      const { resumeIncompleteDeliveries } = require('./delivery-simulator');
      resumeIncompleteDeliveries();
    } catch (e) {
      console.error('[Scheduler] 恢复配送流程失败:', e.message);
    }
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
  processOrderRefund,
};

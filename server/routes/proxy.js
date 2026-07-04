const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error, generateTransactionNo, now } = require('../helpers');
const { createMessage } = require('./messages');
const { simulateDeliveryFlow } = require('../delivery-simulator');

/**
 * GET /api/v1/proxy-pay/:token
 * 获取代付订单信息 (无需登录)
 */
router.get('/:token', (req, res) => {
  const { token } = req.params;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [orderNo, userId] = decoded.split(':');
    const order = db.prepare(`SELECT * FROM \`order\` WHERE order_no = ? AND user_id = ?`).get(orderNo, userId);
    if (!order) {
      return error(res, '代付链接无效或订单不存在', 404);
    }
    const items = db.prepare(`SELECT * FROM order_item WHERE order_id = ?`).all(order.id);
    const user = db.prepare(`SELECT nick_name FROM user WHERE id = ?`).get(userId);
    const addressSnapshot = JSON.parse(order.address_snapshot || '{}');
    return success(res, {
      orderNo: order.order_no,
      payAmount: order.pay_amount,
      status: order.status,
      items: items.map(it => ({ name: it.sku_name, spec: it.spec_name, price: it.price, quantity: it.quantity })),
      requesterName: user?.nick_name || '家人',
      address: addressSnapshot,
    });
  } catch (e) {
    return error(res, '代付链接无效', 400);
  }
});

/**
 * POST /api/v1/proxy-pay/:token/pay
 * 代付支付 (无需登录, Demo: 直接支付成功)
 */
router.post('/:token/pay', (req, res) => {
  const { token } = req.params;
  let orderNo, userId;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    [orderNo, userId] = decoded.split(':');
  } catch (e) {
    return error(res, '代付链接无效', 400);
  }

  const order = db.prepare(`SELECT * FROM \`order\` WHERE order_no = ? AND user_id = ?`).get(orderNo, userId);
  if (!order) {
    return error(res, '订单不存在', 404);
  }
  if (order.pay_status === 1) {
    return error(res, '订单已被支付', 400);
  }
  if (order.status !== 10) {
    return error(res, '订单状态不正确', 400);
  }

  const nowStr = now();
  const transactionNo = generateTransactionNo();
  const wxTransactionId = 'MOCK_PROXY_' + Date.now();
  const items = db.prepare(`SELECT * FROM order_item WHERE order_id = ?`).all(order.id);

  const payTxn = db.transaction(() => {
    db.prepare(`UPDATE \`order\` SET status = 20, pay_status = 1, pay_time = ?, pay_way = 1, wx_transaction_id = ?, pay_user_id = ? WHERE id = ? AND pay_status = 0`)
      .run(nowStr, wxTransactionId, req.body?.proxyUserId || 0, order.id);

    db.prepare(`INSERT INTO payment_transaction (order_id, transaction_no, amount, pay_way, status, wx_transaction_id, created_at, updated_at) VALUES (?, ?, ?, 1, 1, ?, ?, ?)`)
      .run(order.id, transactionNo, order.pay_amount, wxTransactionId, nowStr, nowStr);

    const updateInv = db.prepare(`UPDATE inventory SET locked_stock = locked_stock - ? WHERE warehouse_id = ? AND sku_id = ?`);
    for (const item of items) {
      updateInv.run(item.quantity, order.warehouse_id, item.sku_id);
    }

    const updateSales = db.prepare(`UPDATE sku SET sales_count = sales_count + ? WHERE id = ?`);
    for (const item of items) {
      updateSales.run(item.quantity, item.sku_id);
    }

    const earnedPoints = Math.floor(order.pay_amount);
    const user = db.prepare(`SELECT points, total_consume, member_level FROM user WHERE id = ?`).get(order.user_id);
    db.prepare(`UPDATE user SET total_consume = total_consume + ?, order_count = order_count + 1, points = points + ? WHERE id = ?`)
      .run(order.pay_amount, earnedPoints, order.user_id);
    db.prepare(`INSERT INTO point_transaction (user_id, type, points, balance, remark, order_id) VALUES (?, 1, ?, ?, '代付消费获得', ?)`)
      .run(order.user_id, earnedPoints, (user.points + earnedPoints), order.id);

    const newTotalConsume = user.total_consume + order.pay_amount;
    let newLevel = user.member_level;
    if (newTotalConsume >= 999) newLevel = 3;
    else if (newTotalConsume >= 199) newLevel = 2;
    if (newLevel > user.member_level) {
      db.prepare(`UPDATE user SET member_level = ? WHERE id = ?`).run(newLevel, order.user_id);
    }

    db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, 10, 20, ?, '代付支付成功')`)
      .run(order.id, 'proxy');

    createMessage(order.user_id, 'order_paid', '代付成功', `订单 ${order.order_no} 已由家人代付成功`, order.id);
  });

  try {
    payTxn();
  } catch (e) {
    return error(res, '代付失败: ' + e.message, 500);
  }

  // 演示模式: 代付成功后 3 秒自动模拟配送全流程 (20→30→40→50)
  simulateDeliveryFlow(order.id);

  return success(res, { orderNo, paySuccess: true }, '代付成功');
});

module.exports = router;

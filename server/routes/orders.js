const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error, generateTransactionNo, now } = require('../helpers');
const authMiddleware = require('../middleware/auth');
const { createMessage } = require('./messages');
const { simulateDeliveryFlow } = require('../delivery-simulator');

// Product-specific emoji/bg inference
function inferEmojiBg(name) {
  const n = name || '';
  let bg = 'bg-veg', emoji = '🛒';
  if (n.includes('苹果')) { bg = 'bg-fruit'; emoji = '🍎'; }
  else if (n.includes('香蕉')) { bg = 'bg-fruit'; emoji = '🍌'; }
  else if (n.includes('葡萄')) { bg = 'bg-fruit'; emoji = '🍇'; }
  else if (n.includes('芒果')) { bg = 'bg-fruit'; emoji = '🥭'; }
  else if (n.includes('西红柿')) { bg = 'bg-veg'; emoji = '🍅'; }
  else if (n.includes('黄瓜')) { bg = 'bg-veg'; emoji = '🥒'; }
  else if (n.includes('生菜')) { bg = 'bg-veg'; emoji = '🥬'; }
  else if (n.includes('土豆')) { bg = 'bg-veg'; emoji = '🥔'; }
  else if (n.includes('鸡蛋')) { bg = 'bg-meat'; emoji = '🥚'; }
  else if (n.includes('鸡胸')) { bg = 'bg-meat'; emoji = '🍗'; }
  else if (n.includes('五花')) { bg = 'bg-meat'; emoji = '🥓'; }
  else if (n.includes('牛仔骨')) { bg = 'bg-meat'; emoji = '🥩'; }
  else if (n.includes('虾')) { bg = 'bg-sea'; emoji = '🦐'; }
  else if (n.includes('鲈鱼') || n.includes('三文鱼')) { bg = 'bg-sea'; emoji = '🐟'; }
  else if (n.includes('米')) { bg = 'bg-grain'; emoji = '🍚'; }
  else if (n.includes('油')) { bg = 'bg-grain'; emoji = '🫗'; }
  else if (n.includes('酱油') || n.includes('醋')) { bg = 'bg-grain'; emoji = '🧴'; }
  else if (n.includes('牛奶') || n.includes('酸奶')) { bg = 'bg-milk'; emoji = '🥛'; }
  else if (n.includes('奶酪')) { bg = 'bg-milk'; emoji = '🧀'; }
  else if (n.includes('可乐')) { bg = 'bg-snack'; emoji = '🥤'; }
  else if (n.includes('坚果')) { bg = 'bg-snack'; emoji = '🥜'; }
  else if (n.includes('饼干')) { bg = 'bg-snack'; emoji = '🍪'; }
  else if (n.includes('山泉')) { bg = 'bg-snack'; emoji = '💧'; }
  else if (n.includes('纸巾')) { bg = 'bg-daily'; emoji = '🧻'; }
  else if (n.includes('洗衣')) { bg = 'bg-daily'; emoji = '🧺'; }
  else if (n.includes('垃圾袋')) { bg = 'bg-daily'; emoji = '🗑️'; }
  else if (n.includes('洗洁精')) { bg = 'bg-daily'; emoji = '🧴'; }
  return { bg, emoji };
}

// 所有订单接口都需要登录
router.use(authMiddleware);

/**
 * 将订单的 snake_case 字段映射为前端期望的 camelCase
 */
function mapOrder(o) {
  if (!o) return o;
  return {
    id: o.id,
    orderNo: o.order_no,
    userId: o.user_id,
    communityId: o.community_id,
    warehouseId: o.warehouse_id,
    leaderId: o.leader_id,
    riderId: o.rider_id,
    addressId: o.address_id,
    addressSnapshot: o.address_snapshot,
    status: o.status,
    deliveryType: o.delivery_type,
    deliveryTimeType: o.delivery_time_type,
    deliveryTimeSlot: o.delivery_time_slot,
    deliveryFee: o.delivery_fee,
    skuTotalAmount: o.sku_total_amount,
    discountAmount: o.discount_amount,
    couponId: o.coupon_id,
    couponDiscount: o.coupon_discount,
    payAmount: o.pay_amount,
    remark: o.remark,
    payStatus: o.pay_status,
    payTime: o.pay_time,
    payWay: o.pay_way,
    riderAcceptTime: o.rider_accept_time,
    riderPickTime: o.rider_pick_time,
    deliveredTime: o.delivered_time,
    completedTime: o.completed_time,
    cancelTime: o.cancel_time,
    cancelReason: o.cancel_reason,
    source: o.source,
    groupBuyId: o.group_buy_id,
    expireAt: o.expire_at,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  };
}

/**
 * GET /api/v1/orders
 * 获取当前用户订单列表
 * Query: { status?, page?, pageSize? }
 */
router.get('/', (req, res) => {
  const { status, page = 1, pageSize = 20 } = req.query;
  const offset = (page - 1) * pageSize;

  let sql = `SELECT * FROM \`order\` WHERE user_id = ?`;
  const params = [req.userId];

  if (status) {
    sql += ` AND status = ?`;
    params.push(parseInt(status));
  }

  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const orders = db.prepare(sql).all(...params);

  // 为每个订单加载 items，并补充 bg/emoji
  const itemStmt = db.prepare(`SELECT * FROM order_item WHERE order_id = ?`);
  const result = orders.map(o => {
    const items = itemStmt.all(o.id).map(it => {
      const { bg, emoji } = inferEmojiBg(it.sku_name);
      return { ...it, bg, emoji };
    });
    return { ...mapOrder(o), items };
  });

  return success(res, { list: result, total: result.length, page: parseInt(page), pageSize: parseInt(pageSize) });
});

/**
 * GET /api/v1/orders/:orderNo
 * 获取订单详情
 */
router.get('/:orderNo', (req, res) => {
  const { orderNo } = req.params;
  const order = db.prepare(`SELECT * FROM \`order\` WHERE order_no = ? AND user_id = ?`).get(orderNo, req.userId);

  if (!order) {
    return error(res, '订单不存在', 404);
  }

  const items = db.prepare(`SELECT * FROM order_item WHERE order_id = ?`).all(order.id).map(it => {
    const { bg, emoji } = inferEmojiBg(it.sku_name);
    return { ...it, bg, emoji };
  });
  const address = db.prepare(`SELECT * FROM user_address WHERE id = ?`).get(order.address_id);

  return success(res, { ...mapOrder(order), items, address });
});

/**
 * POST /api/v1/orders
 * 创建订单
 * Body: { items: [{skuId, quantity, specId?}], addressId, deliveryTimeType?, deliveryTimeSlot?, couponId?, remark? }
 */
router.post('/', (req, res) => {
  const { items, addressId, deliveryTimeType = 1, deliveryTimeSlot = null, couponId = null, remark = null } = req.body;

  if (!items || !items.length || !addressId) {
    return error(res, '商品和地址不能为空', 400);
  }

  // 校验地址
  const address = db.prepare(`SELECT * FROM user_address WHERE id = ? AND user_id = ?`).get(addressId, req.userId);
  if (!address) {
    return error(res, '收货地址不存在', 404);
  }

  // 获取用户所属社区的前置仓
  const community = db.prepare(`SELECT id FROM community WHERE leader_id IN (SELECT id FROM leader WHERE user_id = ?) LIMIT 1`).get(req.userId);
  const communityId = community ? community.id : 1;
  const warehouse = db.prepare(`SELECT * FROM warehouse_coverage WHERE community_id = ? LIMIT 1`).get(communityId);
  const warehouseId = warehouse ? warehouse.warehouse_id : 1;

  // 计算订单金额
  let skuTotal = 0;
  const orderItems = [];
  for (const item of items) {
    const sku = db.prepare(`SELECT * FROM sku WHERE id = ? AND status = 1`).get(item.skuId);
    if (!sku) {
      return error(res, `商品 ${item.skuId} 不存在或已下架`, 400);
    }

    let price = sku.sale_price;
    let specName = sku.unit;
    if (item.specId) {
      const spec = db.prepare(`SELECT * FROM sku_spec WHERE id = ? AND sku_id = ?`).get(item.specId, item.skuId);
      if (spec) {
        price = spec.sale_price;
        specName = spec.spec_value;
      }
    }

    // 校验库存
    const inv = db.prepare(`SELECT * FROM inventory WHERE warehouse_id = ? AND sku_id = ?`).get(warehouseId, item.skuId);
    if (!inv || inv.available_stock < item.quantity) {
      return error(res, `${sku.name} 库存不足`, 409);
    }

    const subtotal = price * item.quantity;
    skuTotal += subtotal;
    orderItems.push({ sku, price, specName, quantity: item.quantity, subtotal });
  }

  // 配送费
  const deliveryFee = skuTotal >= 29 ? 0 : 3;

  // 优惠券
  let couponDiscount = 0;
  if (couponId) {
    const uc = db.prepare(`SELECT uc.*, c.* FROM user_coupon uc JOIN coupon c ON uc.coupon_id = c.id WHERE uc.id = ? AND uc.user_id = ? AND uc.status = 0`).get(couponId, req.userId);
    if (uc && skuTotal >= uc.min_order_amount) {
      if (uc.type === 1) couponDiscount = uc.face_value;
      else if (uc.type === 2) couponDiscount = skuTotal * (1 - uc.face_value);
      else if (uc.type === 3) couponDiscount = 0; // 免配送费在 deliveryFee 层处理
    }
  }

  const payAmount = skuTotal + deliveryFee - couponDiscount;
  const orderNo = 'O' + new Date().toISOString().replace(/[-T:.Z]/g, '').substring(0, 14) + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const expireAt = new Date(Date.now() + 15 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);

  const insertOrder = db.prepare(`
    INSERT INTO \`order\` (order_no, user_id, community_id, warehouse_id, address_id, address_snapshot, status, delivery_type, delivery_time_type, delivery_time_slot, delivery_fee, sku_total_amount, discount_amount, coupon_id, coupon_discount, pay_amount, remark, pay_status, source, expire_at)
    VALUES (?, ?, ?, ?, ?, ?, 10, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'normal', ?)
  `);

  const insertItem = db.prepare(`
    INSERT INTO order_item (order_id, sku_id, sku_name, sku_image, spec_name, price, quantity, commission_rate, commission_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateInventory = db.prepare(`
    UPDATE inventory SET available_stock = available_stock - ?, locked_stock = locked_stock + ?
    WHERE warehouse_id = ? AND sku_id = ? AND available_stock >= ?
  `);

  const clearCart = db.prepare(`DELETE FROM cart_items WHERE id = ? AND user_id = ?`);

  const txn = db.transaction(() => {
    const addressSnapshot = JSON.stringify({ name: address.contact_name, phone: address.contact_phone, detail: address.detail_address });
    const result = insertOrder.run(orderNo, req.userId, communityId, warehouseId, addressId, addressSnapshot, deliveryTimeType, deliveryTimeSlot, deliveryFee, skuTotal, couponDiscount, couponId, couponDiscount, payAmount, remark, expireAt);
    const orderId = result.lastInsertRowid;

    for (const oi of orderItems) {
      const commissionRate = oi.sku.commission_rate || 8.00;
      const commissionAmount = parseFloat((oi.price * oi.quantity * commissionRate / 100).toFixed(2));
      insertItem.run(orderId, oi.sku.id, oi.sku.name, oi.sku.main_image, oi.specName, oi.price, oi.quantity, commissionRate, commissionAmount);
      const invResult = updateInventory.run(oi.quantity, oi.quantity, warehouseId, oi.sku.id, oi.quantity);
      if (invResult.changes === 0) {
        throw new Error(`${oi.sku.name} 库存不足`);
      }
    }

    // 核销优惠券 (加并发防护: AND status = 0)
    if (couponId) {
      const couponResult = db.prepare(`UPDATE user_coupon SET status = 1, used_order_id = ? WHERE id = ? AND status = 0`).run(orderId, couponId);
      if (couponResult.changes === 0) {
        throw new Error('优惠券已被使用或不存在');
      }
    }

    // 清空购物车中已下单的商品 (事务内)
    if (req.body.cartItemIds && Array.isArray(req.body.cartItemIds)) {
      for (const cartItemId of req.body.cartItemIds) {
        clearCart.run(cartItemId, req.userId);
      }
    }

    // 订单状态日志
    db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, NULL, 10, ?, '订单创建')`)
      .run(orderId, 'user');

    return orderId;
  });

  let orderId;
  try {
    orderId = txn();
  } catch (e) {
    return error(res, e.message || '下单失败', 400);
  }

  const order = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(orderId);
  const orderItemsData = db.prepare(`SELECT * FROM order_item WHERE order_id = ?`).all(orderId);

  return success(res, { ...mapOrder(order), items: orderItemsData }, '订单创建成功');
});

/**
 * POST /api/v1/orders/:orderNo/pay
 * 模拟支付 (Demo: 直接将订单状态改为待配送)
 * 支持幂等性: 同一订单重复支付不会重复扣减
 */
router.post('/:orderNo/pay', (req, res) => {
  const { orderNo } = req.params;
  const order = db.prepare(`SELECT * FROM \`order\` WHERE order_no = ? AND user_id = ?`).get(orderNo, req.userId);

  if (!order) {
    return error(res, '订单不存在', 404);
  }

  // 幂等性: 已支付的订单直接返回成功
  if (order.pay_status === 1) {
    const updated = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(order.id);
    return success(res, { ...mapOrder(updated), paySuccess: true }, '订单已支付');
  }

  if (order.status !== 10) {
    return error(res, '订单状态不正确', 400);
  }

  // 检查是否已超时
  const expireAt = new Date(order.expire_at + 'Z').getTime();
  if (Date.now() > expireAt) {
    return error(res, '订单已超时，请重新下单', 400);
  }

  const nowStr = now();
  const transactionNo = generateTransactionNo();
  const wxTransactionId = 'MOCK_PAY_' + Date.now();
  const items = db.prepare(`SELECT * FROM order_item WHERE order_id = ?`).all(order.id);

  const payTxn = db.transaction(() => {
    // 1. 更新订单状态
    db.prepare(`
      UPDATE \`order\` SET status = 20, pay_status = 1, pay_time = ?, pay_way = 1, wx_transaction_id = ?
      WHERE id = ? AND pay_status = 0
    `).run(nowStr, wxTransactionId, order.id);

    // 2. 记录支付流水 (幂等性去重)
    db.prepare(`
      INSERT INTO payment_transaction (order_id, transaction_no, amount, pay_way, status, wx_transaction_id, created_at, updated_at)
      VALUES (?, ?, ?, 1, 1, ?, ?, ?)
    `).run(order.id, transactionNo, order.pay_amount, wxTransactionId, nowStr, nowStr);

    // 3. 释放预占库存 (locked_stock 减少，available_stock 在下单时已扣减)
    const updateInv = db.prepare(`UPDATE inventory SET locked_stock = locked_stock - ? WHERE warehouse_id = ? AND sku_id = ?`);
    for (const item of items) {
      updateInv.run(item.quantity, order.warehouse_id, item.sku_id);
    }

    // 4. 更新商品销量
    const updateSales = db.prepare(`UPDATE sku SET sales_count = sales_count + ? WHERE id = ?`);
    for (const item of items) {
      updateSales.run(item.quantity, item.sku_id);
    }

    // 5. 更新用户消费额、订单数、积分
    const earnedPoints = Math.floor(order.pay_amount);
    const user = db.prepare(`SELECT points, total_consume, member_level FROM user WHERE id = ?`).get(order.user_id);
    db.prepare(`UPDATE user SET total_consume = total_consume + ?, order_count = order_count + 1, points = points + ? WHERE id = ?`)
      .run(order.pay_amount, earnedPoints, order.user_id);

    // 6. 记录积分流水
    db.prepare(`INSERT INTO point_transaction (user_id, type, points, balance, remark, order_id) VALUES (?, 1, ?, ?, '消费获得', ?)`)
      .run(order.user_id, earnedPoints, (user.points + earnedPoints), order.id);

    // 7. 会员等级升级判断
    const newTotalConsume = user.total_consume + order.pay_amount;
    let newLevel = user.member_level;
    if (newTotalConsume >= 999) newLevel = 3;
    else if (newTotalConsume >= 199) newLevel = 2;
    if (newLevel > user.member_level) {
      db.prepare(`UPDATE user SET member_level = ? WHERE id = ?`).run(newLevel, order.user_id);
    }

    // 8. 订单状态日志
    db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, 10, 20, ?, '用户支付成功')`)
      .run(order.id, 'system');

    // 9. 发送通知
    createMessage(order.user_id, 'order_paid', '支付成功', `订单 ${order.order_no} 支付成功，团长正在备货`, order.id);
  });

  try {
    payTxn();
  } catch (e) {
    return error(res, '支付失败: ' + e.message, 500);
  }

  // 演示模式: 支付成功后 3 秒自动模拟配送全流程 (20→30→40→50)
  simulateDeliveryFlow(order.id);

  const updated = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(order.id);
  return success(res, { ...mapOrder(updated), paySuccess: true }, '支付成功');
});

/**
 * POST /api/v1/orders/:orderNo/cancel
 * 取消订单
 */
router.post('/:orderNo/cancel', (req, res) => {
  const { orderNo } = req.params;
  const order = db.prepare(`SELECT * FROM \`order\` WHERE order_no = ? AND user_id = ?`).get(orderNo, req.userId);

  if (!order) {
    return error(res, '订单不存在', 404);
  }

  if (order.status !== 10) {
    return error(res, '当前状态不可取消', 400);
  }

  const nowStr = now();

  const cancelTxn = db.transaction(() => {
    db.prepare(`UPDATE \`order\` SET status = 99, cancel_time = ?, cancel_reason = ? WHERE id = ?`)
      .run(nowStr, req.body.reason || '用户取消', order.id);

    // 释放库存
    const items = db.prepare(`SELECT * FROM order_item WHERE order_id = ?`).all(order.id);
    const updateInv = db.prepare(`UPDATE inventory SET locked_stock = locked_stock - ?, available_stock = available_stock + ? WHERE warehouse_id = ? AND sku_id = ?`);
    for (const item of items) {
      updateInv.run(item.quantity, item.quantity, order.warehouse_id, item.sku_id);
    }

    // 返还优惠券
    if (order.coupon_id) {
      db.prepare(`UPDATE user_coupon SET status = 0, used_order_id = NULL WHERE id = ?`).run(order.coupon_id);
    }

    // 订单状态日志
    db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, 10, 99, ?, ?)`)
      .run(order.id, 'user', req.body.reason || '用户取消');
  });

  try {
    cancelTxn();
  } catch (e) {
    return error(res, '取消失败: ' + e.message, 500);
  }

  return success(res, { orderNo, status: 99 }, '订单已取消');
});

/**
 * POST /api/v1/orders/:orderNo/confirm
 * 确认收货
 */
router.post('/:orderNo/confirm', (req, res) => {
  const { orderNo } = req.params;
  const order = db.prepare(`SELECT * FROM \`order\` WHERE order_no = ? AND user_id = ?`).get(orderNo, req.userId);

  if (!order) {
    return error(res, '订单不存在', 404);
  }

  if (order.status !== 40 && order.status !== 30) {
    return error(res, '当前状态不可确认收货', 400);
  }

  const nowStr = now();
  const confirmTxn = db.transaction(() => {
    db.prepare(`UPDATE \`order\` SET status = 50, completed_time = ? WHERE id = ?`).run(nowStr, order.id);

    db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, ?, 50, ?, '用户确认收货')`)
      .run(order.id, order.status, 'user');

    createMessage(order.user_id, 'order_completed', '订单已完成', `订单 ${order.order_no} 已完成，感谢您的惠顾`, order.id);
  });

  try {
    confirmTxn();
  } catch (e) {
    return error(res, '确认失败: ' + e.message, 500);
  }

  return success(res, { orderNo, status: 50 }, '确认收货成功');
});

/**
 * POST /api/v1/orders/:orderNo/refund
 * 申请售后退款
 * Body: { reason, description?, images? }
 */
router.post('/:orderNo/refund', (req, res) => {
  const { orderNo } = req.params;
  const { reason, description = '', images = '' } = req.body;

  if (!reason) {
    return error(res, '请选择售后原因', 400);
  }

  const order = db.prepare(`SELECT * FROM \`order\` WHERE order_no = ? AND user_id = ?`).get(orderNo, req.userId);
  if (!order) {
    return error(res, '订单不存在', 404);
  }

  // 只有已送达、已完成、配送中的订单可以申请售后
  if (![30, 40, 50].includes(order.status)) {
    return error(res, '当前订单状态不支持售后', 400);
  }

  // 检查是否已有进行中的退款
  const existingRefund = db.prepare(`SELECT id FROM refund WHERE order_id = ? AND status = 0`).get(order.id);
  if (existingRefund) {
    return error(res, '该订单已有进行中的售后申请', 409);
  }

  const refundNo = 'R' + Date.now();
  const nowStr = now();

  const refundTxn = db.transaction(() => {
    db.prepare(`
      INSERT INTO refund (order_id, user_id, amount, reason, images, status, leader_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(order.id, order.user_id, order.pay_amount, `${reason}: ${description}`, images, order.leader_id, nowStr, nowStr);

    // 更新订单状态为售后处理中 (status 保持原状态，通过 refund 表追踪)
    db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark) VALUES (?, ?, ?, ?, ?)`)
      .run(order.id, order.status, order.status, 'user', `申请售后: ${reason}`);

    // 通知团长
    if (order.leader_id) {
      const leaderUser = db.prepare(`SELECT user_id FROM leader WHERE id = ?`).get(order.leader_id);
      if (leaderUser) {
        createMessage(leaderUser.user_id, 'refund_request', '新售后申请', `订单 ${order.order_no} 申请售后: ${reason}`, order.id);
      }
    }
  });

  try {
    refundTxn();
  } catch (e) {
    return error(res, '提交售后失败: ' + e.message, 500);
  }

  return success(res, { refundNo, orderNo, status: 0 }, '售后申请已提交，团长将在24小时内处理');
});

/**
 * POST /api/v1/orders/:orderNo/req-proxy
 * 生成代付链接 (子女代付)
 */
router.post('/:orderNo/req-proxy', (req, res) => {
  const { orderNo } = req.params;
  const order = db.prepare(`SELECT * FROM \`order\` WHERE order_no = ? AND user_id = ?`).get(orderNo, req.userId);

  if (!order) {
    return error(res, '订单不存在', 404);
  }

  if (order.status !== 10) {
    return error(res, '当前订单状态不支持代付', 400);
  }

  // 生成代付 token (简单编码: orderNo + userId)
  const token = Buffer.from(`${orderNo}:${order.user_id}:${Date.now()}`).toString('base64');
  const proxyUrl = `/#/proxy-pay/${token}`;

  return success(res, { token, url: proxyUrl, orderNo }, '代付链接已生成，请分享给子女');
});

/**
 * GET /api/v1/orders/:orderNo/rider-location
 * 查询订单骑手位置 (配送中用户端使用)
 */
router.get('/:orderNo/rider-location', (req, res) => {
  const { orderNo } = req.params;
  const order = db.prepare(`SELECT * FROM \`order\` WHERE order_no = ? AND user_id = ?`).get(orderNo, req.userId);
  if (!order) {
    return error(res, '订单不存在', 404);
  }
  if (order.status !== 30 && order.status !== 40) {
    return error(res, '订单不在配送中', 400);
  }
  if (!order.rider_id) {
    return error(res, '暂无骑手信息', 404);
  }
  const rider = db.prepare(`SELECT id, name, phone, lat, lng, location_updated_at FROM rider WHERE id = ?`).get(order.rider_id);
  if (!rider) {
    return error(res, '骑手不存在', 404);
  }
  // 收货地址 (从 address_snapshot 解析经纬度，若无则用社区坐标)
  let destLat = null, destLng = null;
  try {
    const snap = JSON.parse(order.address_snapshot || '{}');
    if (snap.latitude && snap.longitude) {
      destLat = snap.latitude;
      destLng = snap.longitude;
    }
  } catch (e) {}
  if (!destLat) {
    const community = db.prepare(`SELECT latitude, longitude FROM community WHERE id = ?`).get(order.community_id);
    if (community) {
      destLat = community.latitude;
      destLng = community.longitude;
    }
  }
  return success(res, {
    rider: {
      id: rider.id,
      name: rider.name,
      phone: rider.phone,
      latitude: rider.lat,
      longitude: rider.lng,
      locationUpdatedAt: rider.location_updated_at,
    },
    dest: { latitude: destLat, longitude: destLng },
    orderStatus: order.status,
  });
});

module.exports = router;


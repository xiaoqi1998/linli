const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error, now } = require('../helpers');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

/**
 * GET /api/v1/finance/overview
 * 财务概览: 总营收, 总佣金, 总退款, 平台收入
 */
router.get('/overview', (req, res) => {
  // 总营收 (已支付订单)
  const revenue = db.prepare(`
    SELECT COALESCE(SUM(pay_amount), 0) as total FROM \`order\` WHERE pay_status = 1
  `).get();

  // 总佣金 (已结算)
  const commission = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM commission_settlement WHERE status = 1
  `).get();

  // 总退款 (已通过)
  const refund = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM refund WHERE status = 1
  `).get();

  const totalRevenue = revenue?.total || 0;
  const totalCommission = commission?.total || 0;
  const totalRefunds = refund?.total || 0;
  const platformIncome = totalRevenue - totalCommission - totalRefunds;

  return success(res, {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalCommission: Math.round(totalCommission * 100) / 100,
    totalRefunds: Math.round(totalRefunds * 100) / 100,
    platformIncome: Math.round(platformIncome * 100) / 100,
  });
});

/**
 * GET /api/v1/finance/daily
 * 每日财务明细
 * Query: date (YYYY-MM-DD)
 */
router.get('/daily', (req, res) => {
  const date = req.query.date;
  if (!date) {
    return error(res, '缺少 date 参数 (YYYY-MM-DD)', 400);
  }

  // 订单数 & 支付金额
  const orderStats = db.prepare(`
    SELECT COUNT(*) as order_count, COALESCE(SUM(pay_amount), 0) as pay_amount
    FROM \`order\` WHERE pay_status = 1 AND DATE(pay_time) = ?
  `).get(date);

  // 退款
  const refundStats = db.prepare(`
    SELECT COUNT(*) as refund_count, COALESCE(SUM(amount), 0) as refund_amount
    FROM refund WHERE status = 1 AND DATE(created_at) = ?
  `).get(date);

  // 佣金
  const commissionStats = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as commission_amount
    FROM commission_settlement WHERE DATE(created_at) = ?
  `).get(date);

  // 按分类拆分销售
  const categoryBreakdown = db.prepare(`
    SELECT s.category_id, c.name as category_name,
           COUNT(oi.id) as count,
           COALESCE(SUM(oi.price * oi.quantity), 0) as amount
    FROM order_item oi
    INNER JOIN \`order\` o ON o.id = oi.order_id
    INNER JOIN sku s ON s.id = oi.sku_id
    INNER JOIN category c ON c.id = s.category_id
    WHERE o.pay_status = 1 AND DATE(o.pay_time) = ?
    GROUP BY s.category_id
    ORDER BY amount DESC
  `).all(date);

  return success(res, {
    date,
    orders: {
      count: orderStats?.order_count || 0,
      payAmount: Math.round((orderStats?.pay_amount || 0) * 100) / 100,
    },
    refunds: {
      count: refundStats?.refund_count || 0,
      amount: Math.round((refundStats?.refund_amount || 0) * 100) / 100,
    },
    commissions: {
      amount: Math.round((commissionStats?.commission_amount || 0) * 100) / 100,
    },
    breakdown: categoryBreakdown.map(b => ({
      categoryId: b.category_id,
      categoryName: b.category_name,
      count: b.count,
      amount: Math.round(b.amount * 100) / 100,
    })),
  });
});

/**
 * POST /api/v1/finance/record
 * 创建资金流水记录 (内部接口)
 * Body: { type, orderId, amount, direction, description }
 */
router.post('/record', (req, res) => {
  const { type, orderId, amount, direction, description } = req.body;

  if (!type || !direction) {
    return error(res, '缺少 type/direction 参数', 400);
  }

  const result = db.prepare(`
    INSERT INTO finance_record (type, order_id, amount, direction, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(type, orderId || null, parseFloat(amount) || 0, direction, description || '', now());

  return success(res, { id: result.lastInsertRowid }, '流水记录已创建');
});

module.exports = router;

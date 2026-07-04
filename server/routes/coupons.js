const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error } = require('../helpers');

/**
 * GET /api/v1/user/coupons
 * 获取用户优惠券列表
 * Query: status (0=未使用, 1=已使用, 2=已过期, 不传=全部)
 */
router.get('/coupons', (req, res) => {
  const status = req.query.status;
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  let sql = `
    SELECT uc.id, uc.status, uc.valid_start, uc.valid_end, uc.used_at,
           c.id as coupon_id, c.name, c.type, c.face_value, c.min_order_amount,
           c.applicable_type, c.applicable_ids, c.applicable_communities
    FROM user_coupon uc
    INNER JOIN coupon c ON uc.coupon_id = c.id
    WHERE uc.user_id = ?
  `;
  const params = [req.userId];

  if (status !== undefined && status !== '') {
    sql += ' AND uc.status = ?';
    params.push(parseInt(status));
  }

  sql += ' ORDER BY uc.created_at DESC';

  const coupons = db.prepare(sql).all(...params);

  const couponTypeNames = { 1: '满减券', 2: '折扣券', 3: '免配送费券' };

  const result = coupons.map((c) => {
    // 判断是否过期
    let actualStatus = c.status;
    if (c.status === 0 && c.valid_end < now) {
      actualStatus = 2; // 已过期
    }

    return {
      id: c.id,
      couponId: c.coupon_id,
      name: c.name,
      type: c.type,
      typeName: couponTypeNames[c.type] || '未知',
      faceValue: c.face_value,
      minOrderAmount: c.min_order_amount,
      applicableType: c.applicable_type,
      status: actualStatus,
      statusName: actualStatus === 0 ? '未使用' : actualStatus === 1 ? '已使用' : '已过期',
      validStart: c.valid_start,
      validEnd: c.valid_end,
      usedAt: c.used_at,
    };
  });

  return success(res, { list: result });
});

module.exports = router;

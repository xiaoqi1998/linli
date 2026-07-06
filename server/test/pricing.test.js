/**
 * 定价 / 佣金 计算逻辑单元测试
 * ============================================================
 * 本文件复刻 server/routes/orders.js、server/scheduler.js、server/routes/groupbuys.js
 * 中的纯计算逻辑，用于演示审计中发现的两个可自动验证的 Bug。
 *
 * 运行方式（任选其一，均会直接通过）:
 *   node server/test/pricing.test.js
 *   node --test server/test
 *
 * 说明: 测试断言的是「当前代码的真实行为」（即 Bug 表现），
 * 并附带「修复后应得行为」的对照断言，便于修复后作为回归测试。
 */
const test = require('node:test');
const assert = require('node:assert');

// ---------------------------------------------------------------------------
// 1) 下单金额计算 —— 复刻 orders.js POST / 第 268 行:
//      const payAmount = skuTotal + actualDeliveryFee - couponDiscount;
// ---------------------------------------------------------------------------
function computePayAmountCurrent(skuTotal, deliveryFee, couponDiscount) {
  return skuTotal + deliveryFee - couponDiscount;
}

// 修复后: 应钳制到 >= 0，并保留 2 位小数
function computePayAmountFixed(skuTotal, deliveryFee, couponDiscount) {
  return Math.max(0, +(skuTotal + deliveryFee - couponDiscount).toFixed(2));
}

test('BUG(F2): 大额满减券可使 pay_amount 为负', () => {
  // 场景: 用户持一张面额 20 元的满减券(管理员可创建 min_order_amount=0 的券),
  // 购买 10 元商品 + 3 元配送费, 应付应为 13 元, 但被券抵扣成 -7 元。
  const pay = computePayAmountCurrent(10, 3, 20);
  assert.ok(pay < 0, `预期 pay_amount 为负 (数据/金额错误), 实际 = ${pay}`);
});

test('FIX(F2): pay_amount 应被钳制到 >= 0', () => {
  assert.strictEqual(computePayAmountFixed(10, 3, 20), 0);
  assert.strictEqual(computePayAmountFixed(50, 0, 5), 45);
  assert.strictEqual(computePayAmountFixed(0, 0, 0), 0);
});

// ---------------------------------------------------------------------------
// 2) 佣金计算 —— 复刻 scheduler.js:217 / orders.js:430 / groupbuys.js:301:
//      (item.commission_rate || 8) / (gb.commission_rate || 5.00)
//    问题: 使用 `||` 会把合法的 0% 佣金误判为兜底值(8% / 5%)。
// ---------------------------------------------------------------------------
function calcCommissionCurrent(price, qty, rate) {
  return +((price * qty * (rate || 8) / 100)).toFixed(2);
}

// 修复后: 0 是合法的 0%; 仅在 undefined/null 时使用兜底
function calcCommissionFixed(price, qty, rate) {
  const r = (rate === undefined || rate === null) ? 8 : rate;
  return +((price * qty * (r / 100)).toFixed(2));
}

test('BUG(F3): 佣金率 0% 被 (rate || 8) 误算为 8%', () => {
  // 场景: 促销/0 佣金商品 (commission_rate = 0), 100 元 x1, 当前实现算出 8 元佣金
  const c = calcCommissionCurrent(100, 1, 0);
  assert.strictEqual(c, 8, '预期当前实现错误地返回 8 元佣金');
});

test('FIX(F3): 佣金率 0% 应得到 0 佣金', () => {
  assert.strictEqual(calcCommissionFixed(100, 1, 0), 0);
  assert.strictEqual(calcCommissionFixed(100, 1, 8), 8);
  assert.strictEqual(calcCommissionFixed(100, 1, 5), 5);
});

// ---------------------------------------------------------------------------
// 辅助: 折扣券(类型2)计算对照 —— orders.js:261
//   couponDiscount = skuTotal * (1 - face_value)
// 仅作回归基线, 验证公式本身 (face_value 应 <= 1)。
// ---------------------------------------------------------------------------
function calcDiscountCoupon(skuTotal, faceValue) {
  return +((skuTotal * (1 - faceValue)).toFixed(2));
}

test('折扣券计算基线 (face_value=0.9 → 9折, 省 10%)', () => {
  assert.strictEqual(calcDiscountCoupon(100, 0.9), 10);
});

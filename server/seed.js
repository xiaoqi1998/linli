/**
 * 邻里鲜生 - 演示版种子数据脚本
 * 运行: node seed.js
 */
const bcrypt = require('bcryptjs');
const db = require('./db');

function img(text) {
  return `https://placehold.co/400x400/1a3c2e/ffffff?text=${encodeURIComponent(text)}`;
}
function detailImgs(text) {
  return JSON.stringify([img(text + '-详情1'), img(text + '-详情2')]);
}
const now = () => new Date().toISOString().replace('T', ' ').substring(0, 19);
const ago = (min) => new Date(Date.now() - min * 60000).toISOString().replace('T', ' ').substring(0, 19);

// 清空所有表数据 (先子表后父表)
const TABLES_TO_CLEAR = [
  'cart_items', 'admin_log', 'admin_user', 'admin_role',
  'refund', 'rider_delivery', 'rider',
  'group_buy_participant', 'group_buy',
  'leader_withdraw', 'commission_settlement', 'leader',
  'point_transaction', 'user_coupon', 'coupon',
  'payment_transaction', 'order_status_log', 'order_item', '"order"',
  'inventory', 'community_sku', 'sku_spec', 'sku',
  'category', 'warehouse_coverage', 'warehouse', 'community', 'city',
  'user_address', 'user',
];

console.log('清空旧数据...');
const clearAll = db.transaction(() => {
  db.pragma('foreign_keys = OFF');
  for (const table of TABLES_TO_CLEAR) db.exec(`DELETE FROM ${table};`);
  for (const table of TABLES_TO_CLEAR) {
    const clean = table.replace(/"/g, '');
    db.exec(`DELETE FROM sqlite_sequence WHERE name='${clean}';`);
  }
  db.pragma('foreign_keys = ON');
});
clearAll();

console.log('开始插入演示数据...');

const seed = db.transaction(() => {
  // ========================================================================
  // 1. 城市 + 社区 + 前置仓 + 覆盖
  // ========================================================================
  db.prepare(`INSERT INTO city (id, name, code, latitude, longitude, status) VALUES (1, '深圳', '0755', 22.5431, 113.9465, 1)`).run();
  db.prepare(`INSERT INTO community (id, city_id, name, address, latitude, longitude, household_count, leader_id, status) VALUES (1, 1, '阳光小区', '深圳市南山区阳光小区', 22.5431, 113.9465, 1500, 1, 1)`).run();
  db.prepare(`INSERT INTO community (id, city_id, name, address, latitude, longitude, household_count, leader_id, status) VALUES (2, 1, '翠海花园', '深圳市南山区翠海花园', 22.5360, 113.9420, 1200, 2, 1)`).run();
  db.prepare(`INSERT INTO warehouse (id, city_id, name, address, latitude, longitude, radius, status) VALUES (1, 1, '南山前置仓', '深圳市南山区科技园路1号', 22.5400, 113.9450, 3.0, 1)`).run();
  db.prepare(`INSERT INTO warehouse (id, city_id, name, address, latitude, longitude, radius, status) VALUES (2, 1, '福田前置仓', '深圳市福田区深南大道88号', 22.5330, 113.9400, 3.0, 1)`).run();
  db.prepare(`INSERT INTO warehouse_coverage (warehouse_id, community_id) VALUES (1,1),(1,2),(2,2)`).run();

  // ========================================================================
  // 2. 用户 (5个)
  // ========================================================================
  const defaultPwdHash = bcrypt.hashSync('123456', 10);
  const insertUser = db.prepare(`
    INSERT INTO user (id, phone, password_hash, nick_name, avatar_url, member_level, total_consume, order_count, points, source, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  insertUser.run(1, '13800138000', defaultPwdHash, '小邻', img('头像'), 2,  628.50, 12, 628, 'search');
  insertUser.run(2, '13800138001', defaultPwdHash, '王团长', img('王团长'), 3, 1520.00, 42, 1520, 'share');
  insertUser.run(3, '13800138002', defaultPwdHash, '李团长', img('李团长'), 3,  980.00, 28,  980, 'share');
  insertUser.run(4, '13800138003', defaultPwdHash, '张阿姨', img('张阿姨'), 2,  445.00,  8,  445, 'search');
  insertUser.run(5, '13800138004', defaultPwdHash, '陈先生', img('陈先生'), 1,  128.00,  3,  128, 'group');

  // ========================================================================
  // 3. 地址
  // ========================================================================
  const insertAddr = db.prepare(`
    INSERT INTO user_address (id, user_id, contact_name, contact_phone, province, city, district, detail_address, latitude, longitude, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertAddr.run(1, 1, '小邻', '13800138000', '广东省', '深圳市', '南山区', '阳光小区3栋502室', 22.5431, 113.9465, 1);
  insertAddr.run(2, 1, '小邻(公司)', '13800138000', '广东省', '深圳市', '南山区', '科技园路10号A座', 22.5400, 113.9450, 0);
  insertAddr.run(3, 2, '王团长', '13800138001', '广东省', '深圳市', '南山区', '翠海花园7栋101室', 22.5360, 113.9420, 1);
  insertAddr.run(4, 4, '张阿姨', '13800138003', '广东省', '深圳市', '南山区', '阳光小区1栋301室', 22.5431, 113.9465, 1);
  insertAddr.run(5, 5, '陈先生', '13800138004', '广东省', '深圳市', '南山区', '阳光小区5栋1201室', 22.5431, 113.9465, 1);

  // ========================================================================
  // 4. 商品分类
  // ========================================================================
  const cats = [[1,'蔬菜',1],[2,'水果',2],[3,'肉禽蛋',3],[4,'水产',4],[5,'粮油调味',5],[6,'乳制品',6],[7,'零食饮料',7],[8,'日用百货',8]];
  const insertCat = db.prepare(`INSERT INTO category (id, parent_id, name, icon, sort_order, status) VALUES (?, 0, ?, ?, ?, 1)`);
  for (const [id, name, sort] of cats) insertCat.run(id, name, img(name), sort);

  // ========================================================================
  // 5. 商品SKU (30个)
  // ========================================================================
  const skus = [
    // 蔬菜
    [1, 1, '新鲜西红柿', '本地大棚种植，酸甜可口', img('西红柿'), '广东深圳', '冷藏', '500g', 2.00, 6.00, 4.50, 8.00, 342],
    [2, 1, '翠绿黄瓜', '清脆爽口，适合凉拌', img('黄瓜'), '山东寿光', '冷藏', '500g', 1.50, 5.00, 3.50, 8.00, 256],
    [3, 1, '有机生菜', '无农药残留，新鲜采摘', img('生菜'), '云南昆明', '冷藏', '300g', 2.50, 7.00, 5.00, 10.00, 128],
    [4, 1, '黄心土豆', '粉糯香甜，适合炖煮', img('土豆'), '甘肃定西', '常温', '1kg', 1.20, 4.00, 2.99, 8.00, 489],
    // 水果
    [5, 2, '红富士苹果', '山东烟台直采，脆甜多汁', img('红富士苹果'), '山东烟台', '常温', '1kg', 3.00, 12.00, 8.90, 8.00, 672],
    [6, 2, '海南香蕉', '自然熟透，软糯香甜', img('香蕉'), '海南海口', '常温', '1kg', 2.00, 8.00, 5.50, 8.00, 345],
    [7, 2, '阳光玫瑰葡萄', '无籽脆甜，玫瑰香型', img('阳光玫瑰葡萄'), '云南宾川', '冷藏', '500g', 8.00, 25.00, 18.80, 10.00, 198],
    [8, 2, '海南芒果', '金黄饱满，香甜细腻', img('海南芒果'), '海南三亚', '常温', '1kg', 4.00, 15.00, 10.90, 8.00, 267],
    // 肉禽蛋
    [9, 3, '土鸡蛋', '散养土鸡，营养丰富', img('土鸡蛋'), '广东河源', '冷藏', '10枚', 8.00, 18.00, 12.90, 10.00, 423],
    [10, 3, '鸡胸肉', '低脂高蛋白，健身首选', img('鸡胸肉'), '广东广州', '冷冻', '500g', 6.00, 16.00, 11.90, 10.00, 312],
    [11, 3, '黑猪五花肉', '肥瘦相间，口感醇厚', img('五花肉'), '湖南宁乡', '冷藏', '500g', 10.00, 25.00, 18.80, 10.00, 178],
    [12, 3, '澳洲牛仔骨', '进口雪花牛肉，鲜嫩多汁', img('牛仔骨'), '澳大利亚', '冷冻', '500g', 25.00, 60.00, 45.00, 12.00, 89],
    // 水产
    [13, 4, '鲜活基围虾', '深海捕捞，鲜甜弹牙', img('基围虾'), '广东湛江', '冷藏', '500g', 18.00, 45.00, 32.90, 10.00, 156],
    [14, 4, '清江鲈鱼', '鲜活现杀，肉质细嫩', img('鲈鱼'), '湖北清江', '冷藏', '1条约500g', 12.00, 35.00, 25.90, 10.00, 134],
    [15, 4, '挪威三文鱼', '冰鲜进口，刺身级', img('三文鱼'), '挪威', '冷藏', '300g', 30.00, 75.00, 55.00, 12.00, 98],
    // 粮油调味
    [16, 5, '东北珍珠米', '五常产区，软糯香甜', img('东北大米'), '黑龙江五常', '常温', '5kg', 25.00, 65.00, 45.90, 8.00, 567],
    [17, 5, '金龙鱼食用油', '非转基因一级大豆油', img('食用油'), '广东深圳', '常温', '5L', 35.00, 75.00, 55.90, 8.00, 389],
    [18, 5, '海天金标生抽', '酿造酱油，鲜味醇厚', img('海天酱油'), '广东佛山', '常温', '1.9L', 8.00, 18.00, 12.90, 8.00, 445],
    [19, 5, '山西老陈醋', '传统酿造，酸香浓郁', img('山西陈醋'), '山西清徐', '常温', '500ml', 5.00, 12.00, 8.50, 8.00, 234],
    // 乳制品
    [20, 6, '特仑苏纯牛奶', '高品质牧场奶源', img('特仑苏牛奶'), '内蒙古呼和浩特', '冷藏', '250ml*12', 35.00, 75.00, 55.90, 8.00, 423],
    [21, 6, '安慕希酸奶', '希腊式浓稠酸奶', img('安慕希酸奶'), '内蒙古呼和浩特', '冷藏', '200g*12', 28.00, 60.00, 42.90, 8.00, 312],
    [22, 6, '伊利奶酪片', '即食芝士，夹面包好搭档', img('伊利奶酪'), '内蒙古呼和浩特', '冷藏', '100g', 8.00, 18.00, 12.90, 8.00, 156],
    // 零食饮料
    [23, 7, '可口可乐', '经典气泡饮料', img('可口可乐'), '广东深圳', '常温', '330ml*6', 8.00, 18.00, 12.90, 8.00, 678],
    [24, 7, '三只松鼠每日坚果', '混合果仁，营养美味', img('三只松鼠坚果'), '安徽芜湖', '常温', '750g', 25.00, 60.00, 39.90, 8.00, 345],
    [25, 7, '奥利奥饼干', '巧克力夹心，酥脆可口', img('奥利奥饼干'), '北京', '常温', '97g*5', 8.00, 20.00, 13.90, 8.00, 456],
    [26, 7, '农夫山泉矿泉水', '天然饮用水，清冽甘甜', img('农夫山泉'), '浙江杭州', '常温', '550ml*12', 10.00, 24.00, 15.90, 8.00, 789],
    // 日用百货
    [27, 8, '维达纸巾', '原木纯品，4层加厚', img('维达纸巾'), '广东江门', '常温', '3层120抽*10包', 12.00, 30.00, 19.90, 8.00, 567],
    [28, 8, '蓝月亮洗衣液', '深层洁净，温和不伤手', img('蓝月亮洗衣液'), '广东广州', '常温', '2kg', 20.00, 45.00, 29.90, 8.00, 345],
    [29, 8, '加厚垃圾袋', '点断式，承重不破', img('垃圾袋'), '广东深圳', '常温', '45*50cm*100只', 5.00, 15.00, 9.90, 8.00, 678],
    [30, 8, '立白洗洁精', '柠檬清新，去油强劲', img('洗洁精'), '广东广州', '常温', '1.5kg', 8.00, 18.00, 12.90, 8.00, 423],
  ];

  const insertSku = db.prepare(`
    INSERT INTO sku (id, spu_id, category_id, name, subtitle, main_image, detail_images, origin, storage_type, unit, cost_price, market_price, sale_price, commission_rate, sales_count, status)
    VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  for (const s of skus) {
    const [id, catId, name, subtitle, image, origin, storage, unit, cost, market, sale, rate, sales] = s;
    insertSku.run(id, catId, name, subtitle, image, detailImgs(name), origin, storage, unit, cost, market, sale, rate, sales);
  }

  // ========================================================================
  // 6. 商品规格
  // ========================================================================
  const insertSpec = db.prepare(`INSERT INTO sku_spec (id, sku_id, name, price) VALUES (?, ?, ?, ?)`);
  for (const s of skus) {
    const [id, , , , , , , unit, , , sale] = s;
    insertSpec.run(id, id, unit, sale);
  }

  // ========================================================================
  // 7. 社区商品
  // ========================================================================
  const insertCommSku = db.prepare(`INSERT INTO community_sku (community_id, sku_id, is_recommend, is_hot, sort_order) VALUES (?, ?, ?, ?, ?)`);
  for (const s of skus) {
    const [id, , , , , , , , , , , , , sales] = s;
    insertCommSku.run(1, id, id <= 4 ? 1 : 0, sales > 400 ? 1 : 0, id);
    insertCommSku.run(2, id, id >= 5 && id <= 8 ? 1 : 0, sales > 400 ? 1 : 0, id);
  }

  // ========================================================================
  // 8. 库存
  // ========================================================================
  const insertInv = db.prepare(`INSERT INTO inventory (warehouse_id, sku_id, available_stock, locked_stock, warning_threshold) VALUES (?, ?, ?, ?, ?)`);
  for (const s of skus) {
    const [id] = s;
    const stock = id === 3 || id === 12 || id === 15 ? 0 : Math.floor(Math.random() * 150) + 30;
    insertInv.run(1, id, stock, 0, 20);
  }
  for (let i = 1; i <= 15; i++) {
    insertInv.run(2, i, Math.floor(Math.random() * 100) + 20, 0, 20);
  }

  // ========================================================================
  // 9. 团长
  // ========================================================================
  db.prepare(`INSERT INTO leader (id, user_id, name, phone, community_id, commission_rate, total_commission, withdrawable_commission, withdrawn_commission, status)
    VALUES (1, 2, '王团长', '13800138001', 1, 10.00, 1520.00, 380.50, 1139.50, 1)`).run();
  db.prepare(`INSERT INTO leader (id, user_id, name, phone, community_id, commission_rate, total_commission, withdrawable_commission, withdrawn_commission, status)
    VALUES (2, 3, '李团长', '13800138002', 2, 8.00, 980.00, 245.00, 735.00, 1)`).run();

  // ========================================================================
  // 10. 骑手 (4个)
  // ========================================================================
  const insertRider = db.prepare(`
    INSERT INTO rider (id, name, phone, warehouse_id, status, lat, lng, current_orders, location_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const n = now();
  insertRider.run(1, '张骑手', '13900139001', 1, 1, 22.5410, 113.9455, 0, n);
  insertRider.run(2, '陈骑手', '13900139002', 1, 1, 22.5390, 113.9470, 1, n);
  insertRider.run(3, '刘骑手', '13900139003', 2, 1, 22.5340, 113.9410, 0, n);
  insertRider.run(4, '赵骑手', '13900139004', 1, 1, 22.5380, 113.9440, 2, n);

  // ========================================================================
  // 11. 优惠券 (8张)
  // ========================================================================
  const insertCoupon = db.prepare(`
    INSERT INTO coupon (id, name, type, face_value, min_order_amount, applicable_type, applicable_ids, applicable_communities, valid_start, valid_end, total_count, issued_count, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const vs = n;
  const ve = new Date(Date.now() + 30 * 86400000).toISOString().replace('T', ' ').substring(0, 19);
  insertCoupon.run(1, '新人满30减5',   1,  5.00, 30.00, 1, null, null, vs, ve, 1000, 100);
  insertCoupon.run(2, '满50减10',      1, 10.00, 50.00, 1, null, null, vs, ve, 500, 200);
  insertCoupon.run(3, '全场9折券',     2,  0.90, 20.00, 1, null, null, vs, ve, 300, 50);
  insertCoupon.run(4, '免配送费券',    3,  0.00,  0.00, 1, null, null, vs, ve, 500, 100);
  insertCoupon.run(5, '水果满40减8',   1,  8.00, 40.00, 2, '[2]', null, vs, ve, 200, 80);
  insertCoupon.run(6, '肉禽满60减12',  1, 12.00, 60.00, 2, '[3]', null, vs, ve, 200, 60);
  insertCoupon.run(7, '满100减20',     1, 20.00,100.00, 1, null, null, vs, ve, 100, 30);
  insertCoupon.run(8, '8折通用券',     2,  0.80, 30.00, 1, null, null, vs, ve, 150, 40);

  // ========================================================================
  // 12. 用户优惠券
  // ========================================================================
  const insertUserCoupon = db.prepare(`
    INSERT INTO user_coupon (id, user_id, coupon_id, status, valid_start, valid_end)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertUserCoupon.run(1, 1, 1, 0, vs, ve);
  insertUserCoupon.run(2, 1, 2, 0, vs, ve);
  insertUserCoupon.run(3, 1, 4, 0, vs, ve);
  insertUserCoupon.run(4, 1, 5, 0, vs, ve);
  insertUserCoupon.run(5, 4, 1, 0, vs, ve);
  insertUserCoupon.run(6, 4, 3, 0, vs, ve);
  insertUserCoupon.run(7, 5, 1, 1, vs, ve); // 已使用
  insertUserCoupon.run(8, 5, 6, 0, vs, ve);

  // ========================================================================
  // 13. 拼团活动 (4个)
  // ========================================================================
  const expireGb1 = new Date(Date.now() + 6 * 3600000).toISOString().replace('T', ' ').substring(0, 19);
  const expireGb2 = new Date(Date.now() + 12 * 3600000).toISOString().replace('T', ' ').substring(0, 19);
  const expireGb3 = new Date(Date.now() + 24 * 3600000).toISOString().replace('T', ' ').substring(0, 19);
  const expireGb4 = new Date(Date.now() + 48 * 3600000).toISOString().replace('T', ' ').substring(0, 19);

  db.prepare(`INSERT INTO group_buy (id, leader_id, community_id, sku_id, sku_spec_id, group_price, target_count, joined_count, status, expire_at)
    VALUES (1, 1, 1, 2, 2, 2.99, 5, 2, 1, ?)`).run(expireGb1);
  db.prepare(`INSERT INTO group_buy (id, leader_id, community_id, sku_id, sku_spec_id, group_price, target_count, joined_count, status, expire_at)
    VALUES (2, 2, 2, 6, 6, 3.99, 3, 1, 1, ?)`).run(expireGb2);
  db.prepare(`INSERT INTO group_buy (id, leader_id, community_id, sku_id, sku_spec_id, group_price, target_count, joined_count, status, expire_at)
    VALUES (3, 1, 1, 5, 5, 6.99, 10, 7, 1, ?)`).run(expireGb3);
  db.prepare(`INSERT INTO group_buy (id, leader_id, community_id, sku_id, sku_spec_id, group_price, target_count, joined_count, status, expire_at)
    VALUES (4, 1, 1, 9, 9, 9.90, 8, 8, 2, ?)`).run(expireGb4); // 已成团

  db.prepare(`INSERT INTO group_buy_participant (group_buy_id, user_id, status) VALUES (1,1,1),(1,4,1)`).run();
  db.prepare(`INSERT INTO group_buy_participant (group_buy_id, user_id, status) VALUES (2,3,1)`).run();
  db.prepare(`INSERT INTO group_buy_participant (group_buy_id, user_id, status) VALUES (3,1,1),(3,4,1),(3,5,1)`).run();
  db.prepare(`INSERT INTO group_buy_participant (group_buy_id, user_id, status) VALUES (4,1,1),(4,2,1),(4,4,1),(4,5,1)`).run();

  // ========================================================================
  // 14. 管理员
  // ========================================================================
  db.prepare(`INSERT INTO admin_role (id, name, permissions) VALUES (1, '超级管理员', '["*"]')`).run();
  db.prepare(`INSERT INTO admin_user (id, username, password, real_name, role_id, status) VALUES (1, 'admin', ?, '系统管理员', 1, 1)`).run(bcrypt.hashSync('admin123', 10));

  // ========================================================================
  // 15. 积分流水
  // ========================================================================
  db.prepare(`INSERT INTO point_transaction (user_id, type, points, balance, remark) VALUES (1, 1, 100, 100, '新用户注册赠送')`).run();
  db.prepare(`INSERT INTO point_transaction (user_id, type, points, balance, remark) VALUES (1, 1, 186, 286, '消费累计积分')`).run();
  db.prepare(`INSERT INTO point_transaction (user_id, type, points, balance, remark) VALUES (1, 2, -50, 236, '积分兑换优惠券')`).run();
  db.prepare(`INSERT INTO point_transaction (user_id, type, points, balance, remark) VALUES (4, 1, 100, 100, '新用户注册赠送')`).run();
  db.prepare(`INSERT INTO point_transaction (user_id, type, points, balance, remark) VALUES (5, 1, 100, 100, '新用户注册赠送')`).run();

  // ========================================================================
  // 16. 演示订单 (15个, 覆盖所有状态, 多用户)
  // ========================================================================
  const insertOrder = db.prepare(`
    INSERT INTO "order" (id, order_no, user_id, community_id, warehouse_id, leader_id, rider_id, address_id, address_snapshot, status, delivery_type, delivery_time_type, delivery_time_slot, delivery_fee, sku_total_amount, discount_amount, coupon_id, coupon_discount, pay_amount, remark, pay_status, pay_time, pay_way, rider_accept_time, rider_pick_time, delivered_time, completed_time, cancel_time, cancel_reason, source, expire_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'normal', ?, ?)
  `);
  const insertOrderItem = db.prepare(`
    INSERT INTO order_item (order_id, sku_id, sku_name, sku_image, spec_name, price, quantity, commission_rate, commission_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOrderLog = db.prepare(`
    INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertPayment = db.prepare(`
    INSERT INTO payment_transaction (order_id, transaction_no, amount, pay_way, status, created_at)
    VALUES (?, ?, ?, 1, 1, ?)
  `);
  const insertCommission = db.prepare(`
    INSERT INTO commission_settlement (leader_id, order_id, amount, status, settled_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertRiderDelivery = db.prepare(`
    INSERT INTO rider_delivery (rider_id, order_id, status, accept_time, pick_time, deliver_time, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Helper to build order
  function createOrder(cfg) {
    const {
      id, orderNo, userId, status, leaderId, riderId,
      items, deliveryFee, discount, couponId, couponDiscount, remark,
      payStatus, payTime, acceptTime, pickTime, deliverTime, completeTime,
      cancelTime, cancelReason, expireAt, createdAt
    } = cfg;

    const skuTotal = items.reduce((s, it) => s + it.price * it.qty, 0);
    const payAmount = skuTotal + deliveryFee - (couponDiscount || 0);
    const address = db.prepare(`SELECT * FROM user_address WHERE user_id = ? AND is_default = 1`).get(userId);
    const addressSnap = address ? JSON.stringify({ name: address.contact_name, phone: address.contact_phone, detail: address.detail_address }) : '{}';
    const commId = leaderId === 1 ? 1 : 2;
    const whId = commId === 1 ? 1 : 2;

    insertOrder.run(
      id, orderNo, userId, commId, whId, leaderId || null, riderId || null, address ? address.id : 1,
      addressSnap, status, deliveryFee, skuTotal, discount || 0, couponId || null, couponDiscount || 0,
      payAmount, remark || '', payStatus || 0, payTime || null,
      acceptTime || null, pickTime || null, deliverTime || null, completeTime || null,
      cancelTime || null, cancelReason || null, expireAt, createdAt
    );

    // Items
    for (const it of items) {
      const commAmt = (it.price * it.qty * (it.commRate || 8) / 100).toFixed(2);
      insertOrderItem.run(id, it.skuId, it.name, it.image, it.spec, it.price, it.qty, it.commRate || 8, commAmt);
    }

    // Status log
    const logs = [];
    logs.push({ from: null, to: 10, op: 'system', remark: '订单创建', at: createdAt });
    if (payTime) logs.push({ from: 10, to: 20, op: 'system', remark: '用户支付', at: payTime });
    if (acceptTime) logs.push({ from: 20, to: 30, op: 'rider', remark: '骑手接单', at: acceptTime });
    if (pickTime) logs.push({ from: 30, to: 30, op: 'rider', remark: '骑手取货', at: pickTime });
    if (deliverTime) logs.push({ from: 30, to: 40, op: 'rider', remark: '骑手送达', at: deliverTime });
    if (completeTime) logs.push({ from: 40, to: 50, op: 'user', remark: '用户确认收货', at: completeTime });
    if (cancelTime) logs.push({ from: status === 10 ? 10 : 20, to: 99, op: 'user', remark: cancelReason || '用户取消', at: cancelTime });
    for (const lg of logs) {
      insertOrderLog.run(id, lg.from, lg.to, lg.op, lg.remark, lg.at);
    }

    // Payment transaction
    if (payStatus === 1 && payTime) {
      insertPayment.run(id, 'T' + Date.now() + id, payAmount, payTime);
    }

    // Commission settlement
    if (completeTime && leaderId) {
      const totalComm = items.reduce((s, it) => s + it.price * it.qty * (it.commRate || 8) / 100, 0);
      insertCommission.run(leaderId, id, totalComm.toFixed(2), 1, completeTime, completeTime);
    }

    // Rider delivery
    if (riderId && (status === 30 || status === 40 || status === 50)) {
      insertRiderDelivery.run(riderId, id,
        status === 50 ? 3 : (status === 40 ? 2 : 1),
        acceptTime, pickTime, deliverTime, createdAt
      );
    }
  }

  // ---- 订单数据 ----
  const skuMap = {};
  for (const s of skus) {
    const [id, catId, name, subtitle, image] = s;
    skuMap[id] = { id, catId, name, image, spec: s[7], price: s[11] };
  }

  // 订单1: user1, 已完成, leader1, rider2
  createOrder({
    id: 1, orderNo: 'O20260703083001', userId: 1, status: 50, leaderId: 1, riderId: 2,
    items: [
      { skuId: 1, name: '新鲜西红柿', image: skuMap[1].image, spec: '500g', price: 4.50, qty: 2, commRate: 10 },
      { skuId: 9, name: '土鸡蛋', image: skuMap[9].image, spec: '10枚', price: 12.90, qty: 1, commRate: 10 },
    ],
    deliveryFee: 0, discount: 0, couponId: null, couponDiscount: 0, remark: '请送门口',
    payStatus: 1, payTime: ago(180), acceptTime: ago(170), pickTime: ago(160), deliverTime: ago(140), completeTime: ago(120),
    expireAt: ago(200), createdAt: ago(185)
  });

  // 订单2: user1, 配送中, leader1, rider4
  createOrder({
    id: 2, orderNo: 'O20260703094502', userId: 1, status: 30, leaderId: 1, riderId: 4,
    items: [
      { skuId: 5, name: '红富士苹果', image: skuMap[5].image, spec: '1kg', price: 8.90, qty: 2, commRate: 10 },
      { skuId: 20, name: '特仑苏纯牛奶', image: skuMap[20].image, spec: '250ml*12', price: 55.90, qty: 1, commRate: 8 },
    ],
    deliveryFee: 0, discount: 0, couponId: null, couponDiscount: 0, remark: '',
    payStatus: 1, payTime: ago(90), acceptTime: ago(80), pickTime: ago(70),
    expireAt: ago(100), createdAt: ago(95)
  });

  // 订单3: user1, 待付款
  createOrder({
    id: 3, orderNo: 'O20260703103003', userId: 1, status: 10, leaderId: 1, riderId: null,
    items: [
      { skuId: 13, name: '鲜活基围虾', image: skuMap[13].image, spec: '500g', price: 32.90, qty: 1, commRate: 10 },
      { skuId: 18, name: '海天金标生抽', image: skuMap[18].image, spec: '1.9L', price: 12.90, qty: 1, commRate: 8 },
    ],
    deliveryFee: 0, discount: 0, couponId: null, couponDiscount: 0, remark: '',
    payStatus: 0, payTime: null,
    expireAt: ago(-15), createdAt: ago(10)
  });

  // 订单4: user1, 待配送, leader1
  createOrder({
    id: 4, orderNo: 'O20260703110004', userId: 1, status: 20, leaderId: 1, riderId: null,
    items: [
      { skuId: 16, name: '东北珍珠米', image: skuMap[16].image, spec: '5kg', price: 45.90, qty: 1, commRate: 8 },
    ],
    deliveryFee: 0, discount: 0, couponId: null, couponDiscount: 0, remark: '放门口',
    payStatus: 1, payTime: ago(20),
    expireAt: ago(35), createdAt: ago(25)
  });

  // 订单5: user1, 已取消
  createOrder({
    id: 5, orderNo: 'O20260702143005', userId: 1, status: 99, leaderId: 1, riderId: null,
    items: [
      { skuId: 23, name: '可口可乐', image: skuMap[23].image, spec: '330ml*6', price: 12.90, qty: 3, commRate: 8 },
    ],
    deliveryFee: 0, discount: 0, couponId: null, couponDiscount: 0, remark: '',
    payStatus: 0, payTime: null, cancelTime: ago(1440), cancelReason: '不想要了',
    expireAt: ago(1500), createdAt: ago(1480)
  });

  // 订单6: user4, 已完成, leader1, rider2
  createOrder({
    id: 6, orderNo: 'O20260703080006', userId: 4, status: 50, leaderId: 1, riderId: 2,
    items: [
      { skuId: 2, name: '翠绿黄瓜', image: skuMap[2].image, spec: '500g', price: 3.50, qty: 3, commRate: 10 },
      { skuId: 4, name: '黄心土豆', image: skuMap[4].image, spec: '1kg', price: 2.99, qty: 2, commRate: 10 },
      { skuId: 26, name: '农夫山泉矿泉水', image: skuMap[26].image, spec: '550ml*12', price: 15.90, qty: 1, commRate: 8 },
    ],
    deliveryFee: 0, discount: 0, couponId: null, couponDiscount: 0, remark: '',
    payStatus: 1, payTime: ago(240), acceptTime: ago(230), pickTime: ago(220), deliverTime: ago(200), completeTime: ago(180),
    expireAt: ago(260), createdAt: ago(245)
  });

  // 订单7: user4, 待收货, leader1, rider4
  createOrder({
    id: 7, orderNo: 'O20260703101507', userId: 4, status: 40, leaderId: 1, riderId: 4,
    items: [
      { skuId: 7, name: '阳光玫瑰葡萄', image: skuMap[7].image, spec: '500g', price: 18.80, qty: 2, commRate: 10 },
    ],
    deliveryFee: 0, discount: 0, couponId: null, couponDiscount: 0, remark: '轻拿轻放',
    payStatus: 1, payTime: ago(60), acceptTime: ago(50), pickTime: ago(40), deliverTime: ago(20),
    expireAt: ago(80), createdAt: ago(65)
  });

  // 订单8: user5, 已完成, leader1, rider1
  createOrder({
    id: 8, orderNo: 'O20260703072008', userId: 5, status: 50, leaderId: 1, riderId: 1,
    items: [
      { skuId: 10, name: '鸡胸肉', image: skuMap[10].image, spec: '500g', price: 11.90, qty: 2, commRate: 10 },
      { skuId: 11, name: '黑猪五花肉', image: skuMap[11].image, spec: '500g', price: 18.80, qty: 1, commRate: 10 },
    ],
    deliveryFee: 3, discount: 0, couponId: null, couponDiscount: 0, remark: '',
    payStatus: 1, payTime: ago(300), acceptTime: ago(290), pickTime: ago(280), deliverTime: ago(260), completeTime: ago(240),
    expireAt: ago(320), createdAt: ago(305)
  });

  // 订单9: user5, 待付款
  createOrder({
    id: 9, orderNo: 'O20260703112009', userId: 5, status: 10, leaderId: 1, riderId: null,
    items: [
      { skuId: 14, name: '清江鲈鱼', image: skuMap[14].image, spec: '1条约500g', price: 25.90, qty: 1, commRate: 10 },
      { skuId: 21, name: '安慕希酸奶', image: skuMap[21].image, spec: '200g*12', price: 42.90, qty: 1, commRate: 8 },
    ],
    deliveryFee: 0, discount: 0, couponId: null, couponDiscount: 0, remark: '',
    payStatus: 0, payTime: null,
    expireAt: ago(-5), createdAt: ago(5)
  });

  // 订单10: user1, 已完成, leader1, rider2 (使用优惠券)
  createOrder({
    id: 10, orderNo: 'O20260702153010', userId: 1, status: 50, leaderId: 1, riderId: 2,
    items: [
      { skuId: 6, name: '海南香蕉', image: skuMap[6].image, spec: '1kg', price: 5.50, qty: 2, commRate: 10 },
      { skuId: 8, name: '海南芒果', image: skuMap[8].image, spec: '1kg', price: 10.90, qty: 2, commRate: 10 },
      { skuId: 27, name: '维达纸巾', image: skuMap[27].image, spec: '3层120抽*10包', price: 19.90, qty: 1, commRate: 8 },
    ],
    deliveryFee: 0, discount: 5, couponId: 1, couponDiscount: 5, remark: '',
    payStatus: 1, payTime: ago(2880), acceptTime: ago(2870), pickTime: ago(2860), deliverTime: ago(2840), completeTime: ago(2820),
    expireAt: ago(2900), createdAt: ago(2885)
  });

  // 订单11: user2(团长自己下单), 已完成, leader2, rider3
  createOrder({
    id: 11, orderNo: 'O20260703090011', userId: 2, status: 50, leaderId: 2, riderId: 3,
    items: [
      { skuId: 17, name: '金龙鱼食用油', image: skuMap[17].image, spec: '5L', price: 55.90, qty: 1, commRate: 8 },
      { skuId: 19, name: '山西老陈醋', image: skuMap[19].image, spec: '500ml', price: 8.50, qty: 2, commRate: 8 },
    ],
    deliveryFee: 0, discount: 0, couponId: null, couponDiscount: 0, remark: '',
    payStatus: 1, payTime: ago(210), acceptTime: ago(200), pickTime: ago(190), deliverTime: ago(170), completeTime: ago(150),
    expireAt: ago(230), createdAt: ago(215)
  });

  // 订单12: user4, 配送中, leader1, rider4
  createOrder({
    id: 12, orderNo: 'O20260703105012', userId: 4, status: 30, leaderId: 1, riderId: 4,
    items: [
      { skuId: 22, name: '伊利奶酪片', image: skuMap[22].image, spec: '100g', price: 12.90, qty: 3, commRate: 8 },
      { skuId: 25, name: '奥利奥饼干', image: skuMap[25].image, spec: '97g*5', price: 13.90, qty: 1, commRate: 8 },
    ],
    deliveryFee: 0, discount: 0, couponId: null, couponDiscount: 0, remark: '',
    payStatus: 1, payTime: ago(45), acceptTime: ago(35), pickTime: ago(25),
    expireAt: ago(60), createdAt: ago(50)
  });

  // 订单13: user1, 已取消 (已支付后取消)
  createOrder({
    id: 13, orderNo: 'O20260702091513', userId: 1, status: 99, leaderId: 1, riderId: null,
    items: [
      { skuId: 12, name: '澳洲牛仔骨', image: skuMap[12].image, spec: '500g', price: 45.00, qty: 1, commRate: 12 },
    ],
    deliveryFee: 0, discount: 0, couponId: null, couponDiscount: 0, remark: '',
    payStatus: 1, payTime: ago(4320), cancelTime: ago(4310), cancelReason: '商品缺货，联系客服取消',
    expireAt: ago(4350), createdAt: ago(4330)
  });

  // 订单14: user5, 待收货, leader1, rider1
  createOrder({
    id: 14, orderNo: 'O20260703100514', userId: 5, status: 40, leaderId: 1, riderId: 1,
    items: [
      { skuId: 3, name: '有机生菜', image: skuMap[3].image, spec: '300g', price: 5.00, qty: 2, commRate: 10 },
      { skuId: 28, name: '蓝月亮洗衣液', image: skuMap[28].image, spec: '2kg', price: 29.90, qty: 1, commRate: 8 },
    ],
    deliveryFee: 0, discount: 0, couponId: null, couponDiscount: 0, remark: '',
    payStatus: 1, payTime: ago(75), acceptTime: ago(65), pickTime: ago(55), deliverTime: ago(35),
    expireAt: ago(90), createdAt: ago(80)
  });

  // 订单15: user1, 已完成, leader2, rider3 (大订单)
  createOrder({
    id: 15, orderNo: 'O20260702120015', userId: 1, status: 50, leaderId: 2, riderId: 3,
    items: [
      { skuId: 15, name: '挪威三文鱼', image: skuMap[15].image, spec: '300g', price: 55.00, qty: 1, commRate: 12 },
      { skuId: 24, name: '三只松鼠每日坚果', image: skuMap[24].image, spec: '750g', price: 39.90, qty: 1, commRate: 8 },
      { skuId: 29, name: '加厚垃圾袋', image: skuMap[29].image, spec: '45*50cm*100只', price: 9.90, qty: 2, commRate: 8 },
      { skuId: 30, name: '立白洗洁精', image: skuMap[30].image, spec: '1.5kg', price: 12.90, qty: 1, commRate: 8 },
    ],
    deliveryFee: 0, discount: 10, couponId: 2, couponDiscount: 10, remark: '周末聚餐备货',
    payStatus: 1, payTime: ago(5760), acceptTime: ago(5750), pickTime: ago(5740), deliverTime: ago(5720), completeTime: ago(5700),
    expireAt: ago(5780), createdAt: ago(5765)
  });

  // 更新用户消费统计
  db.prepare(`UPDATE user SET total_consume = 286.50, order_count = 8 WHERE id = 1`).run();
  db.prepare(`UPDATE user SET total_consume = 445.00, order_count = 5 WHERE id = 4`).run();
  db.prepare(`UPDATE user SET total_consume = 128.00, order_count = 3 WHERE id = 5`).run();
});

seed();

// 统计
const stats = {
  城市: db.prepare('SELECT COUNT(*) as c FROM city').get().c,
  社区: db.prepare('SELECT COUNT(*) as c FROM community').get().c,
  前置仓: db.prepare('SELECT COUNT(*) as c FROM warehouse').get().c,
  商品分类: db.prepare('SELECT COUNT(*) as c FROM category').get().c,
  商品SKU: db.prepare('SELECT COUNT(*) as c FROM sku').get().c,
  商品规格: db.prepare('SELECT COUNT(*) as c FROM sku_spec').get().c,
  社区商品: db.prepare('SELECT COUNT(*) as c FROM community_sku').get().c,
  库存记录: db.prepare('SELECT COUNT(*) as c FROM inventory').get().c,
  用户: db.prepare('SELECT COUNT(*) as c FROM user').get().c,
  地址: db.prepare('SELECT COUNT(*) as c FROM user_address').get().c,
  团长: db.prepare('SELECT COUNT(*) as c FROM leader').get().c,
  骑手: db.prepare('SELECT COUNT(*) as c FROM rider').get().c,
  优惠券: db.prepare('SELECT COUNT(*) as c FROM coupon').get().c,
  用户优惠券: db.prepare('SELECT COUNT(*) as c FROM user_coupon').get().c,
  拼团活动: db.prepare('SELECT COUNT(*) as c FROM group_buy').get().c,
  拼团参与者: db.prepare('SELECT COUNT(*) as c FROM group_buy_participant').get().c,
  订单: db.prepare('SELECT COUNT(*) as c FROM "order"').get().c,
  订单项: db.prepare('SELECT COUNT(*) as c FROM order_item').get().c,
  订单状态日志: db.prepare('SELECT COUNT(*) as c FROM order_status_log').get().c,
  支付流水: db.prepare('SELECT COUNT(*) as c FROM payment_transaction').get().c,
  佣金结算: db.prepare('SELECT COUNT(*) as c FROM commission_settlement').get().c,
  骑手配送: db.prepare('SELECT COUNT(*) as c FROM rider_delivery').get().c,
  管理员: db.prepare('SELECT COUNT(*) as c FROM admin_user').get().c,
};

console.log('\n========================================');
console.log('  邻里鲜生演示数据插入完成!');
console.log('========================================');
for (const [key, val] of Object.entries(stats)) {
  console.log(`  ${key}: ${val} 条`);
}
console.log('========================================');
console.log('\n默认用户: 13800138000 / 123456');
console.log('管理员: admin / admin123');
console.log('服务器启动: node app.js\n');

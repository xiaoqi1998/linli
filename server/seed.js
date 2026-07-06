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
// 真实素材本地路径 (图片由 AI 生成后存放于 server/uploads)
function avatarFor(id) { return `/uploads/avatars/${((id - 1) % 12) + 1}.png`; }
function prodMain(id) { return `/uploads/products/${id}_main.png`; }
function prodDetail(id) { return `/uploads/products/${id}_detail.png`; }
const now = () => new Date().toISOString().replace('T', ' ').substring(0, 19);
const ago = (min) => new Date(Date.now() - min * 60000).toISOString().replace('T', ' ').substring(0, 19);

// 清空所有表数据 (先子表后父表)
const TABLES_TO_CLEAR = [
  'cart_items', 'admin_log', 'admin_user', 'admin_role',
  'refund', 'rider_delivery', 'rider_warehouse', 'rider',
  'group_buy_participant', 'group_buy',
  'leader_withdraw', 'commission_settlement', 'leader',
  'point_transaction', 'user_coupon', 'coupon',
  'payment_transaction', 'order_status_log', 'order_item', '"order"',
  'inventory', 'community_sku', 'sku_spec', 'sku',
  'category', 'warehouse_coverage', 'warehouse', 'community', 'city',
  'user_address', 'user',
];

console.log('清空旧数据...');
// foreign_keys pragma 不能在事务内修改, 必须在事务外设置
db.pragma('foreign_keys = OFF');
const clearAll = db.transaction(() => {
  for (const table of TABLES_TO_CLEAR) db.exec(`DELETE FROM ${table};`);
  for (const table of TABLES_TO_CLEAR) {
    const clean = table.replace(/"/g, '');
    db.exec(`DELETE FROM sqlite_sequence WHERE name='${clean}';`);
  }
});
clearAll();
db.pragma('foreign_keys = ON');

console.log('开始插入演示数据...');

const seed = db.transaction(() => {
  // ========================================================================
  // 1. 城市 + 社区 + 前置仓(网点) + 覆盖
  //    12个城市, 20个网点, 20个社区 — 覆盖全国主要区域用于按1000公里划分
  // ========================================================================
  // 城市 [id, name, code, lat, lng]
  const CITIES = [
    [1, '深圳', '0755', 22.5431, 113.9465],
    [2, '广州', '020',  23.1291, 113.2644],
    [3, '北京', '010',  39.9042, 116.4074],
    [4, '上海', '021',  31.2304, 121.4737],
    [5, '杭州', '0571', 30.2741, 120.1551],
    [6, '成都', '028',  30.5728, 104.0668],
    [7, '武汉', '027',  30.5928, 114.3055],
    [8, '重庆', '023',  29.5630, 106.5516],
    [9, '西安', '029',  34.3416, 108.9398],
    [10,'南京', '025',  32.0603, 118.7969],
    [11,'苏州', '0512', 31.2989, 120.5853],
    [12,'长沙', '0731', 28.2282, 112.9388],
  ];
  const insertCity = db.prepare(`INSERT INTO city (id, name, code, latitude, longitude, status) VALUES (?, ?, ?, ?, ?, 1)`);
  for (const c of CITIES) insertCity.run(...c);

  // 网点(前置仓) [id, city_id, name, address, lat, lng, radius]
  const WAREHOUSES = [
    [1, 1,  '南山前置仓', '深圳市南山区科技园路1号',      22.5400, 113.9450, 3.0],
    [2, 1,  '福田前置仓', '深圳市福田区深南大道88号',     22.5330, 113.9400, 3.0],
    [3, 2,  '天河前置仓', '广州市天河区天河路208号',       23.1370, 113.3310, 3.0],
    [4, 2,  '海珠前置仓', '广州市海珠区江南大道中188号',   23.0830, 113.2620, 3.0],
    [5, 3,  '朝阳前置仓', '北京市朝阳区建国路88号',        39.9080, 116.4550, 3.0],
    [6, 3,  '海淀前置仓', '北京市海淀区中关村大街1号',     39.9840, 116.3070, 3.0],
    [7, 3,  '丰台前置仓', '北京市丰台区南三环西路6号',     39.8380, 116.2870, 3.0],
    [8, 4,  '浦东前置仓', '上海市浦东新区张江路100号',     31.2040, 121.6050, 3.0],
    [9, 4,  '徐汇前置仓', '上海市徐汇区漕溪北路88号',     31.1950, 121.4370, 3.0],
    [10,5,  '西湖前置仓', '杭州市西湖区文三路50号',        30.2760, 120.1340, 3.0],
    [11,5,  '滨江前置仓', '杭州市滨江区江南大道588号',     30.2080, 120.2070, 3.0],
    [12,6,  '锦江前置仓', '成都市锦江区春熙路30号',       30.6580, 104.0820, 3.0],
    [13,6,  '高新前置仓', '成都市高新区天府大道北段1号',   30.5750, 104.0720, 3.0],
    [14,7,  '武昌前置仓', '武汉市武昌区中南路99号',       30.5440, 114.3160, 3.0],
    [15,7,  '光谷前置仓', '武汉市洪山区珞喻路100号',      30.5110, 114.4050, 3.0],
    [16,8,  '渝中前置仓', '重庆市渝中区解放碑民权路20号',  29.5550, 106.5780, 3.0],
    [17,9,  '雁塔前置仓', '西安市雁塔区小寨西路12号',     34.2310, 108.9270, 3.0],
    [18,10, '鼓楼前置仓', '南京市鼓楼区中山北路200号',    32.0660, 118.7780, 3.0],
    [19,11, '工业园前置仓','苏州市工业园区星海街88号',     31.3170, 120.6280, 3.0],
    [20,12, '岳麓前置仓', '长沙市岳麓区麓山南路1号',      28.1870, 112.9470, 3.0],
  ];
  const insertWh = db.prepare(`INSERT INTO warehouse (id, city_id, name, address, latitude, longitude, radius, status) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`);
  for (const w of WAREHOUSES) insertWh.run(...w);

  // 社区 [id, city_id, name, address, lat, lng, household_count, leader_id]
  const COMMUNITIES = [
    [1, 1,  '阳光小区',        '深圳市南山区阳光小区',        22.5431, 113.9465, 1500, 1],
    [2, 1,  '翠海花园',        '深圳市南山区翠海花园',        22.5360, 113.9420, 1200, 2],
    [3, 2,  '珠江花城',        '广州市天河区珠江花城',        23.1400, 113.3380, 1800, 3],
    [4, 2,  '滨江东花园',      '广州市海珠区滨江东花园',      23.0900, 113.2680, 950,  4],
    [5, 3,  '国贸公寓',        '北京市朝阳区国贸公寓',        39.9100, 116.4600, 1300, 5],
    [6, 3,  '中关村小区',      '北京市海淀区中关村小区',      39.9860, 116.3120, 1600, 6],
    [7, 3,  '方庄社区',        '北京市丰台区方庄社区',        39.8420, 116.2920, 1100, 7],
    [8, 4,  '张江汤臣豪园',    '上海市浦东新区张江汤臣豪园',  31.2060, 121.6080, 1400, 8],
    [9, 4,  '徐汇苑',          '上海市徐汇区徐汇苑',          31.1970, 121.4400, 1250, 9],
    [10,5,  '文三新村',        '杭州市西湖区文三新村',        30.2780, 120.1370, 1000, 10],
    [11,5,  '江南文园',        '杭州市滨江区江南文园',        30.2100, 120.2100, 1350, 11],
    [12,6,  '春熙路社区',      '成都市锦江区春熙路社区',      30.6600, 104.0850, 1500, 12],
    [13,6,  '天府软件园社区',  '成都市高新区天府软件园社区',  30.5770, 104.0750, 1700, 13],
    [14,7,  '中南花园',        '武汉市武昌区中南花园',        30.5460, 114.3190, 1150, 14],
    [15,7,  '光谷青年社区',    '武汉市洪山区光谷青年社区',    30.5130, 114.4080, 1800, 15],
    [16,8,  '解放碑社区',      '重庆市渝中区解放碑社区',      29.5570, 106.5810, 1200, 16],
    [17,9,  '小寨社区',        '西安市雁塔区小寨社区',        34.2330, 108.9300, 1000, 17],
    [18,10, '鼓楼花园',        '南京市鼓楼区鼓楼花园',        32.0680, 118.7810, 1300, 18],
    [19,11, '星海花园',        '苏州市工业园区星海花园',      31.3190, 120.6310, 1100, 19],
    [20,12, '岳麓山社区',      '长沙市岳麓区岳麓山社区',      28.1890, 112.9500, 1250, 20],
  ];
  const insertComm = db.prepare(`INSERT INTO community (id, city_id, name, address, latitude, longitude, household_count, leader_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`);
  for (const c of COMMUNITIES) insertComm.run(...c);

  // 仓库覆盖关系 (社区 -> 网点)
  const COVERAGE = [
    [1,1],[1,2],[2,2],   // 深圳南山仓覆盖社区1,2; 福田仓覆盖社区2
    [3,3],[4,4],         // 广州
    [5,5],[6,6],[7,7],   // 北京
    [8,8],[9,9],         // 上海
    [10,10],[11,11],     // 杭州
    [12,12],[13,13],     // 成都
    [14,14],[15,15],     // 武汉
    [16,16],[17,17],     // 重庆、西安
    [18,18],[19,19],[20,20], // 南京、苏州、长沙
  ];
  const insertCov = db.prepare(`INSERT INTO warehouse_coverage (warehouse_id, community_id) VALUES (?, ?)`);
  for (const [wid, cid] of COVERAGE) insertCov.run(wid, cid);

  // ========================================================================
  // 2. 用户 (24个: 5个原始用户 + 18个团长用户 + 1个代付测试用户)
  // ========================================================================
  const defaultPwdHash = bcrypt.hashSync('123456', 10);
  const insertUser = db.prepare(`
    INSERT INTO user (id, phone, password_hash, nick_name, avatar_url, member_level, total_consume, order_count, points, source, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  // 原始5个用户
  insertUser.run(1, '13800138000', defaultPwdHash, '小邻', avatarFor(1), 2,  628.50, 12, 628, 'search');
  insertUser.run(2, '13800138001', defaultPwdHash, '王团长', avatarFor(2), 3, 1520.00, 42, 1520, 'share');
  insertUser.run(3, '13800138002', defaultPwdHash, '李团长', avatarFor(3), 3,  980.00, 28,  980, 'share');
  insertUser.run(4, '13800138003', defaultPwdHash, '张阿姨', avatarFor(4), 2,  445.00,  8,  445, 'search');
  insertUser.run(5, '13800138004', defaultPwdHash, '陈先生', avatarFor(5), 1,  128.00,  3,  128, 'group');
  // 新增团长用户 (id 6-23) — 对应社区3-20的团长
  const NEW_LEADER_USERS = [
    [6,  '13800138005', '周强',   'share'],
    [7,  '13800138006', '吴敏',   'share'],
    [8,  '13800138007', '郑伟',   'share'],
    [9,  '13800138008', '王芳',   'search'],
    [10, '13800138009', '刘洋',   'search'],
    [11, '13800138010', '陈静',   'share'],
    [12, '13800138011', '杨帆',   'share'],
    [13, '13800138012', '赵磊',   'search'],
    [14, '13800138013', '黄丽',   'share'],
    [15, '13800138014', '周涛',   'search'],
    [16, '13800138015', '吴婷',   'share'],
    [17, '13800138016', '郑浩',   'search'],
    [18, '13800138017', '孙磊',   'share'],
    [19, '13800138018', '马超',   'search'],
    [20, '13800138019', '朱琳',   'share'],
    [21, '13800138020', '胡斌',   'search'],
    [22, '13800138021', '林燕',   'share'],
    [23, '13800138022', '郭峰',   'search'],
  ];
  for (const [id, phone, name, source] of NEW_LEADER_USERS) {
    insertUser.run(id, phone, defaultPwdHash, name, avatarFor(id), 1 + (id % 3), (id * 37.5).toFixed(2), id % 12, id * 30, source);
  }
  // 代付测试用户 (子女代付场景)
  insertUser.run(24, '13800138023', defaultPwdHash, '小邻女儿', avatarFor(24), 2, 320.00, 6, 320, 'share');

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
  for (const [id, name, sort] of cats) insertCat.run(id, name, `/uploads/categories/${id}.png`, sort);

  // 首页 Banner 轮播 (真实素材位于 server/uploads/banners)
  const insertBanner = db.prepare(`INSERT INTO banner (title, subtitle, image, bg, link_type, link_value, sort_order, community_ids, status, valid_start, valid_end) VALUES (?, ?, ?, 'banner-fresh', NULL, NULL, ?, NULL, 1, ?, ?)`);
  const banners = [
    [1, '新鲜直达 当日采摘', '产地直采 · 社区团购更实惠'],
    [2, '海鲜水产 鲜活上桌', '冷链直送 · 锁住每一口鲜味'],
    [3, '肉禽蛋品 源头好肉', '散养土鸡蛋 · 当日现采现发'],
    [4, '乳制品早餐 营养每一天', '牧场直供 · 品质有保障'],
    [5, '零食饮料 囤货狂欢', '大牌正品 · 低价来袭'],
    [6, '日用百货 一站购齐', '居家好物 · 省心省力'],
  ];
  for (const [sort, title, subtitle] of banners) {
    insertBanner.run(title, subtitle, `/uploads/banners/${sort}.png`, sort, now(), new Date(Date.now() + 30 * 86400000).toISOString().replace('T', ' ').substring(0, 19));
  }

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
    const [id, catId, name, subtitle, , origin, storage, unit, cost, market, sale, rate, sales] = s;
    const mainImage = prodMain(id);
    const detailImages = JSON.stringify([mainImage, prodDetail(id)]);
    insertSku.run(id, catId, name, subtitle, mainImage, detailImages, origin, storage, unit, cost, market, sale, rate, sales);
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
  // 7. 社区商品 (所有社区均上架全部商品, 推荐与热销按分类轮换)
  // ========================================================================
  const insertCommSku = db.prepare(`INSERT INTO community_sku (community_id, sku_id, is_recommend, is_hot, sort_order) VALUES (?, ?, ?, ?, ?)`);
  for (const comm of COMMUNITIES) {
    const commId = comm[0];
    for (const s of skus) {
      const [id, catId, , , , , , , , , , , , sales] = s;
      // 每个社区推荐不同分类的商品, 热销按销量阈值
      const isRec = (commId % 8) + 1 === catId ? 1 : 0;
      const isHot = sales > 400 ? 1 : 0;
      insertCommSku.run(commId, id, isRec, isHot, id);
    }
  }

  // ========================================================================
  // 8. 库存 (所有网点均需库存)
  // ========================================================================
  const insertInv = db.prepare(`INSERT INTO inventory (warehouse_id, sku_id, available_stock, locked_stock, warning_threshold) VALUES (?, ?, ?, ?, ?)`);
  for (const wh of WAREHOUSES) {
    const whId = wh[0];
    for (const s of skus) {
      const [id] = s;
      // 部分网点部分商品缺货 (更真实)
      const oos = (whId + id) % 7 === 0;
      const stock = oos ? 0 : Math.floor(Math.random() * 150) + 30;
      insertInv.run(whId, id, stock, 0, 20);
    }
  }

  // ========================================================================
  // 9. 团长 (20个: 每个社区一个团长)
  // ========================================================================
  // [id, user_id, name, phone, community_id, commission_rate, total_commission, withdrawable, withdrawn]
  const LEADERS = [
    [1, 2,  '王团长', '13800138001', 1,  10.00, 1520.00, 380.50, 1139.50],
    [2, 3,  '李团长', '13800138002', 2,  8.00,   980.00, 245.00,  735.00],
    [3, 6,  '周强',   '13800138005', 3,  9.00,   680.00, 180.00,  500.00],
    [4, 7,  '吴敏',   '13800138006', 4,  8.00,   520.00, 130.00,  390.00],
    [5, 8,  '郑伟',   '13800138007', 5,  10.00,  890.00, 220.00,  670.00],
    [6, 9,  '王芳',   '13800138008', 6,  8.00,   450.00, 120.00,  330.00],
    [7, 10, '刘洋',   '13800138009', 7,  9.00,   380.00,  95.00,  285.00],
    [8, 11, '陈静',   '13800138010', 8,  10.00,  720.00, 200.00,  520.00],
    [9, 12, '杨帆',   '13800138011', 9,  8.00,   410.00, 110.00,  300.00],
    [10,13, '赵磊',   '13800138012', 10, 9.00,   560.00, 150.00,  410.00],
    [11,14, '黄丽',   '13800138013', 11, 8.00,   330.00,  85.00,  245.00],
    [12,15, '周涛',   '13800138014', 12, 10.00,  610.00, 165.00,  445.00],
    [13,16, '吴婷',   '13800138015', 13, 9.00,   470.00, 125.00,  345.00],
    [14,17, '郑浩',   '13800138016', 14, 8.00,   390.00, 100.00,  290.00],
    [15,18, '孙磊',   '13800138017', 15, 10.00,  650.00, 175.00,  475.00],
    [16,19, '马超',   '13800138018', 16, 8.00,   350.00,  90.00,  260.00],
    [17,20, '朱琳',   '13800138019', 17, 9.00,   280.00,  70.00,  210.00],
    [18,21, '胡斌',   '13800138020', 18, 10.00,  510.00, 140.00,  370.00],
    [19,22, '林燕',   '13800138021', 19, 8.00,   420.00, 115.00,  305.00],
    [20,23, '郭峰',   '13800138022', 20, 9.00,   360.00,  95.00,  265.00],
  ];
  const insertLeader = db.prepare(`INSERT INTO leader (id, user_id, name, phone, community_id, commission_rate, total_commission, withdrawable_commission, withdrawn_commission, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
  for (const l of LEADERS) insertLeader.run(...l);

  // ========================================================================
  // 10. 骑手 (40个: 每个网点2个骑手, 部分骑手跨多个站点)
  // ========================================================================
  const RIDER_NAMES = ['张骑手','陈骑手','刘骑手','赵骑手','孙骑手','周骑手','吴骑手','郑骑手',
    '王骑手','李骑手','冯骑手','陈骑手','褚骑手','卫骑手','蒋骑手','沈骑手',
    '韩骑手','杨骑手','朱骑手','秦骑手','尤骑手','许骑手','何骑手','吕骑手',
    '施骑手','黄骑手','梁骑手','宋骑手','唐骑手','薛骑手','雷骑手','贺骑手',
    '倪骑手','汤骑手','滕骑手','殷骑手','罗骑手','毕骑手','郝骑手','邬骑手'];
  const insertRider = db.prepare(`
    INSERT INTO rider (id, name, phone, warehouse_id, status, lat, lng, current_orders, location_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRiderWh = db.prepare(`
    INSERT INTO rider_warehouse (rider_id, warehouse_id, is_default, status) VALUES (?, ?, ?, 1)
  `);
  const n = now();
  let riderId = 1;
  for (const wh of WAREHOUSES) {
    const [whId, , , , whLat, whLng] = wh;
    for (let r = 0; r < 2; r++) {
      const name = RIDER_NAMES[(riderId - 1) % RIDER_NAMES.length];
      const phone = '139' + String(130000 + riderId).padStart(6, '0');
      const lat = whLat + (Math.random() - 0.5) * 0.008;
      const lng = whLng + (Math.random() - 0.5) * 0.008;
      insertRider.run(riderId, name, phone, whId, 1, lat, lng, riderId % 3, n);
      insertRiderWh.run(riderId, whId, 1);
      riderId++;
    }
  }

  // 部分骑手增加跨站点配送能力 (每个城市的第1个骑手同时服务2个站点)
  let crossRiderId = 1;
  for (let i = 0; i < WAREHOUSES.length; i += 2) {
    const wh1Id = WAREHOUSES[i][0];
    const wh2Id = WAREHOUSES[i + 1]?.[0];
    if (wh2Id) {
      insertRiderWh.run(crossRiderId, wh2Id, 0);
    }
    crossRiderId += 2;
  }

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
    INSERT INTO rider_delivery (rider_id, order_id, status, accept_time, pick_time, deliver_time, distance, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      let deliveryStatus = 1;
      if (status === 50 || status === 40) deliveryStatus = 3;
      else if (pickTime) deliveryStatus = 2;
      const distance = Math.round((Math.random() * 2 + 0.5) * 100) / 100;
      insertRiderDelivery.run(riderId, id, deliveryStatus,
        acceptTime, pickTime, deliverTime, distance, createdAt, createdAt
      );
    }
  }

  // ---- 订单数据 ----
  const skuMap = {};
  for (const s of skus) {
    const [id, catId, name, subtitle] = s;
    skuMap[id] = { id, catId, name, image: prodMain(id), spec: s[7], price: s[11] };
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

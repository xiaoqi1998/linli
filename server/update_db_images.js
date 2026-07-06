// 将数据库中的图片字段指向本地真实素材，并插入 banner 轮播数据
const db = require('./db');

const now = () => new Date().toISOString().replace('T', ' ').substring(0, 19);
const validEnd = new Date(Date.now() + 30 * 86400000).toISOString().replace('T', ' ').substring(0, 19);

// 1. SKU 主图 + 详情图
const skus = db.prepare('SELECT id FROM sku ORDER BY id').all();
const updSku = db.prepare('UPDATE sku SET main_image = ?, detail_images = ? WHERE id = ?');
const tx1 = db.transaction(() => {
  for (const { id } of skus) {
    const main = `/uploads/products/${id}_main.png`;
    const detail = `/uploads/products/${id}_detail.png`;
    updSku.run(main, JSON.stringify([main, detail]), id);
  }
})();
console.log(`更新 SKU 图片: ${skus.length} 个`);

// 2. 分类图标
const cats = db.prepare('SELECT id FROM category ORDER BY id').all();
const updCat = db.prepare('UPDATE category SET icon = ? WHERE id = ?');
for (const { id } of cats) updCat.run(`/uploads/categories/${id}.png`, id);
console.log(`更新分类图标: ${cats.length} 个`);

// 3. 用户头像 (12 张池化覆盖全部用户)
db.prepare(`UPDATE user SET avatar_url = '/uploads/avatars/' || ((id - 1) % 12 + 1) || '.png'`).run();
const userCnt = db.prepare('SELECT COUNT(*) AS c FROM user').get().c;
console.log(`更新用户头像: ${userCnt} 个 (池化 12 张)`);

// 4. 订单项图片同步为对应商品主图
db.prepare(`UPDATE order_item SET sku_image = (SELECT s.main_image FROM sku s WHERE s.id = order_item.sku_id)`).run();
const oiCnt = db.prepare('SELECT COUNT(*) AS c FROM order_item').get().c;
console.log(`同步订单项图片: ${oiCnt} 条`);

// 5. 插入 banner 轮播 (若为空)
const bannerCount = db.prepare('SELECT COUNT(*) AS c FROM banner').get().c;
if (bannerCount === 0) {
  const ins = db.prepare(`INSERT INTO banner (title, subtitle, image, bg, link_type, link_value, sort_order, community_ids, status, valid_start, valid_end)
    VALUES (?, ?, ?, 'banner-fresh', NULL, NULL, ?, NULL, 1, ?, ?)`);
  const banners = [
    [1, '新鲜直达 当日采摘', '产地直采 · 社区团购更实惠', '/uploads/banners/1.png'],
    [2, '海鲜水产 鲜活上桌', '冷链直送 · 锁住每一口鲜味', '/uploads/banners/2.png'],
    [3, '肉禽蛋品 源头好肉', '散养土鸡蛋 · 当日现采现发', '/uploads/banners/3.png'],
    [4, '乳制品早餐 营养每一天', '牧场直供 · 品质有保障', '/uploads/banners/4.png'],
    [5, '零食饮料 囤货狂欢', '大牌正品 · 低价来袭', '/uploads/banners/5.png'],
    [6, '日用百货 一站购齐', '居家好物 · 省心省力', '/uploads/banners/6.png'],
  ];
  const tx2 = db.transaction(() => {
    for (const [sort, title, subtitle, image] of banners) {
      ins.run(title, subtitle, image, sort, now(), validEnd);
    }
  })();
  console.log(`插入 banner 轮播: ${banners.length} 张`);
} else {
  // 已存在则仅刷新图片路径
  for (let id = 1; id <= 6; id++) {
    db.prepare('UPDATE banner SET image = ? WHERE id = ?').run(`/uploads/banners/${id}.png`, id);
  }
  console.log(`banner 已存在(${bannerCount} 张)，仅刷新图片路径`);
}

console.log('数据库图片资源更新完成。');

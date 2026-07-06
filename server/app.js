const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 限流中间件 (全局: 每分钟 120 次)
const rateLimit = require('./middleware/rateLimit');
app.use('/api', rateLimit({ max: 120 }));

// 静态文件
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Web 前端静态资源 (三端)
app.use('/', express.static(path.join(__dirname, '..', 'web')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.use('/leader', express.static(path.join(__dirname, '..', 'leader')));
app.use('/rider', express.static(path.join(__dirname, '..', 'rider')));

// JWT 认证中间件
const authMiddleware = require('./middleware/auth');

// 路由导入
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const groupBuyRoutes = require('./routes/groupbuys');
const leaderRoutes = require('./routes/leader');
const addressRoutes = require('./routes/addresses');
const userRoutes = require('./routes/user');
const couponRoutes = require('./routes/coupons');
const adminRoutes = require('./routes/admin');
const messageRoutes = require('./routes/messages');
const riderRoutes = require('./routes/rider');
const proxyRoutes = require('./routes/proxy');
const reviewRoutes = require('./routes/review');
const notificationRoutes = require('./routes/notification');
const eventRoutes = require('./routes/event');
const financeRoutes = require('./routes/finance');

// 公开路由 (无需认证)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/group-buys', groupBuyRoutes);
app.use('/api/v1/proxy-pay', proxyRoutes); // 代付路由无需认证
app.use('/api/v1/events', eventRoutes); // 埋点路由 (内部按需鉴权)
app.use('/api/v1/reviews', reviewRoutes); // 评价路由 (公开读取, 写入需鉴权)
app.use('/api/v1/notifications', notificationRoutes); // 通知路由 (内部按需鉴权)

// 需要认证的路由
app.use('/api/v1/cart', authMiddleware, cartRoutes);
app.use('/api/v1/orders', authMiddleware, orderRoutes);
app.use('/api/v1/leader', authMiddleware, leaderRoutes);
app.use('/api/v1/rider', authMiddleware, riderRoutes);
app.use('/api/v1/messages', authMiddleware, messageRoutes);
app.use('/api/v1/user', authMiddleware, addressRoutes);
app.use('/api/v1/user', authMiddleware, userRoutes);
app.use('/api/v1/user', authMiddleware, couponRoutes);
app.use('/api/v1/admin', authMiddleware, adminRoutes);
app.use('/api/v1/finance', authMiddleware, financeRoutes);

// 缺失的内联路由 (演示版补充)
app.get('/api/v1/communities/current', authMiddleware, (req, res) => {
  // 优先从 user_community 表获取用户当前社区
  const uc = db.prepare(`SELECT c.*, ct.name as city_name FROM user_community uc JOIN community c ON c.id = uc.community_id LEFT JOIN city ct ON ct.id = c.city_id WHERE uc.user_id = ? AND uc.is_current = 1`).get(req.userId);
  if (uc) {
    uc.eta = 30;
    return res.json({ code: 0, message: 'success', data: uc });
  }
  // Fallback: 默认第一个社区
  const community = db.prepare('SELECT c.*, ct.name as city_name FROM community c LEFT JOIN city ct ON ct.id = c.city_id WHERE c.status = 1 ORDER BY c.id LIMIT 1').get();
  if (!community) {
    return res.json({ code: 0, message: 'success', data: { id: 1, name: '阳光小区', eta: 30 } });
  }
  community.eta = 30;
  // 自动关联用户与社区
  db.prepare(`INSERT OR IGNORE INTO user_community (user_id, community_id, is_current) VALUES (?, ?, 1)`).run(req.userId, community.id);
  db.prepare(`UPDATE user_community SET is_current = 0 WHERE user_id = ? AND community_id != ?`).run(req.userId, community.id);
  res.json({ code: 0, message: 'success', data: community });
});

app.get('/api/v1/categories', (req, res) => {
  const list = db.prepare('SELECT * FROM category WHERE status = 1 ORDER BY sort_order').all();
  res.json({ code: 0, message: 'success', data: { list } });
});

app.get('/api/v1/banners', (req, res) => {
  // 优先从 banner 表读取, 如果表为空则使用默认数据
  const dbBanners = db.prepare(`SELECT * FROM banner WHERE status = 1 ORDER BY sort_order ASC, id ASC`).all();
  if (dbBanners.length > 0) {
    const list = dbBanners.map(b => ({
      id: b.id,
      title: b.title,
      subtitle: b.subtitle || '',
      image: b.image || '',
      linkType: b.link_type || 'home',
      linkValue: b.link_value || '',
      bg: b.bg || 'banner-fresh',
    }));
    return res.json({ code: 0, message: 'success', data: { list } });
  }
  // 默认 Banner (表为空时)
  const list = [
    { id: 1, title: '今日特价 鲜果直采', subtitle: '车厘子低至49.9元', image: '/uploads/banners/1.png', linkType: 'category', linkValue: '2', bg: 'banner-fresh' },
    { id: 2, title: '邻里拼团 9.9元起', subtitle: '邻居一起买更便宜', image: '/uploads/banners/2.png', linkType: 'groupBuy', linkValue: '', bg: 'banner-group' },
    { id: 3, title: '新人首单立减5元', subtitle: '30分钟极速送达', image: '/uploads/banners/3.png', linkType: 'coupon', linkValue: '1', bg: 'banner-new' },
  ];
  res.json({ code: 0, message: 'success', data: { list } });
});

app.get('/api/v1/user/points', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT points FROM user WHERE id = ?').get(req.userId);
  const transactions = db.prepare('SELECT * FROM point_transaction WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(req.userId);
  res.json({ code: 0, message: 'success', data: { points: user?.points || 0, list: transactions } });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ code: 0, message: 'success', data: { status: 'ok', service: 'linli-fresh-server' } });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在', data: null });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ code: 500, message: err.message || '服务器内部错误', data: null });
});

const PORT = process.env.PORT || 3000;

// 启动定时任务调度器
const { startScheduler } = require('./scheduler');

app.listen(PORT, () => {
  console.log('========================================');
  console.log(`  邻里鲜生后端服务已启动`);
  console.log(`  地址: http://localhost:${PORT}`);
  console.log(`  健康检查: http://localhost:${PORT}/health`);
  console.log('========================================');
  startScheduler();
});

module.exports = app;

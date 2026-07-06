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

// 公开路由 (无需认证)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/group-buys', groupBuyRoutes);
app.use('/api/v1/proxy-pay', proxyRoutes); // 代付路由无需认证

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

// 缺失的内联路由 (演示版补充)
app.get('/api/v1/communities/current', authMiddleware, (req, res) => {
  const community = db.prepare('SELECT c.*, ct.name as city_name FROM community c LEFT JOIN city ct ON ct.id = c.city_id WHERE c.id = 1').get();
  if (!community) {
    return res.json({ code: 0, message: 'success', data: { id: 1, name: '阳光小区', eta: 30 } });
  }
  // Add eta field for frontend
  community.eta = 30;
  res.json({ code: 0, message: 'success', data: community });
});

app.get('/api/v1/categories', (req, res) => {
  const list = db.prepare('SELECT * FROM category WHERE status = 1 ORDER BY sort_order').all();
  res.json({ code: 0, message: 'success', data: { list } });
});

app.get('/api/v1/banners', (req, res) => {
  const list = [
    { id: 1, title: '今日特价 鲜果直采', subtitle: '车厘子低至49.9元', image: '/uploads/banner1.jpg', linkType: 'category', linkValue: '2', bg: 'banner-fresh' },
    { id: 2, title: '邻里拼团 9.9元起', subtitle: '邻居一起买更便宜', image: '/uploads/banner2.jpg', linkType: 'groupBuy', linkValue: '', bg: 'banner-group' },
    { id: 3, title: '新人首单立减5元', subtitle: '30分钟极速送达', image: '/uploads/banner3.jpg', linkType: 'coupon', linkValue: '1', bg: 'banner-new' },
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

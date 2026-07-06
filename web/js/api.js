/* ==========================================================================
   邻里鲜生 · API Client
   Fetch wrapper with auth token, base URL, and graceful mock data fallback
   ========================================================================== */

const API = (function () {
  // 使用相对路径, 部署到任意主机/端口都能正确访问后端 API
  const BASE_URL = '/api/v1';
  const TOKEN_KEY = 'linli_token';
  const TIMEOUT = 6000;

  // ---- Token management ----
  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }
  function setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  // ---- Core fetch wrapper ----
  async function request(method, path, body, opts = {}) {
    const url = BASE_URL + path;
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json();
      if (!res.ok) {
        throw { code: data.code || res.status, message: data.message || '请求失败' };
      }
      return data.data !== undefined ? data.data : data;
    } catch (err) {
      clearTimeout(timer);
      // Network error / timeout / server down → fall back to mock
      if (opts.mock !== false) {
        const mockResult = mockHandler(method, path, body);
        if (mockResult !== undefined) return mockResult;
      }
      throw err;
    }
  }

  const get = (p, opts) => request('GET', p, null, opts);
  const post = (p, b, opts) => request('POST', p, b, opts);
  const put = (p, b, opts) => request('PUT', p, b, opts);
  const del = (p, body) => request('DELETE', p, body);

  /* ========================================================================
     Mock Data & Handler — keeps the UI fully functional without backend
     ======================================================================== */
  const CATEGORIES = [
    { id: 1, name: '蔬菜', emoji: '🥬', bg: 'bg-veg' },
    { id: 2, name: '水果', emoji: '🍎', bg: 'bg-fruit' },
    { id: 3, name: '肉禽蛋', emoji: '🍖', bg: 'bg-meat' },
    { id: 4, name: '水产', emoji: '🐟', bg: 'bg-sea' },
    { id: 5, name: '粮油调味', emoji: '🌾', bg: 'bg-grain' },
    { id: 6, name: '乳制品', emoji: '🥛', bg: 'bg-milk' },
    { id: 7, name: '零食饮料', emoji: '🍪', bg: 'bg-snack' },
    { id: 8, name: '日用百货', emoji: '🧴', bg: 'bg-daily' },
  ];

  const PRODUCTS = [
    { id: 101, name: '本地小番茄 500g', subtitle: '沙瓤多汁 酸甜可口', categoryId: 1, emoji: '🍅', bg: 'bg-veg', spec: '500g/盒', price: 9.9, oldPrice: 15.9, sales: 342, stock: 88, origin: '山东寿光', storage: '冷藏', tags: ['recommend', 'special'], specs: [{ name: '500g', price: 9.9 }, { name: '1kg', price: 18.8 }], detailImages: 3 },
    { id: 102, name: '有机西兰花', subtitle: '基地直采 绿色认证', categoryId: 1, emoji: '🥦', bg: 'bg-veg', spec: '约400g/颗', price: 6.5, oldPrice: 9.9, sales: 218, stock: 50, origin: '云南昆明', storage: '冷藏', tags: ['recommend'], specs: [{ name: '1颗', price: 6.5 }, { name: '3颗', price: 17.9 }], detailImages: 2 },
    { id: 103, name: '本地青菜', subtitle: '今晨采摘 嫩绿新鲜', categoryId: 1, emoji: '🥬', bg: 'bg-veg', spec: '约300g/把', price: 3.9, oldPrice: 5.9, sales: 530, stock: 120, origin: '本地农场', storage: '冷藏', tags: ['special'], specs: [{ name: '1把', price: 3.9 }, { name: '3把', price: 10.5 }], detailImages: 2 },
    { id: 104, name: '土豆 1kg', subtitle: '黄心土豆 炖煮皆宜', categoryId: 1, emoji: '🥔', bg: 'bg-veg', spec: '1kg/袋', price: 4.9, oldPrice: 7.9, sales: 412, stock: 200, origin: '甘肃定西', storage: '阴凉', tags: ['hot'], specs: [{ name: '1kg', price: 4.9 }, { name: '5kg', price: 21.9 }], detailImages: 2 },

    { id: 201, name: '红富士苹果 1kg', subtitle: '脆甜多汁 山东烟台', categoryId: 2, emoji: '🍎', bg: 'bg-fruit', spec: '1kg/袋', price: 12.9, oldPrice: 19.9, sales: 680, stock: 150, origin: '山东烟台', storage: '常温', tags: ['recommend', 'hot'], specs: [{ name: '1kg', price: 12.9 }, { name: '5kg', price: 55.0 }], detailImages: 3 },
    { id: 202, name: '海南金钻凤梨', subtitle: '免削皮 香甜不涩口', categoryId: 2, emoji: '🍍', bg: 'bg-fruit', spec: '约1.5kg/个', price: 25.9, oldPrice: 35.9, sales: 156, stock: 30, origin: '海南', storage: '常温', tags: ['new'], specs: [{ name: '1个', price: 25.9 }, { name: '2个', price: 49.9 }], detailImages: 2 },
    { id: 203, name: '智利车厘子 2J', subtitle: '空运直达 饱满脆甜', categoryId: 2, emoji: '🍒', bg: 'bg-fruit', spec: '500g/盒', price: 49.9, oldPrice: 79.9, sales: 89, stock: 15, origin: '智利', storage: '冷藏', tags: ['special', 'new'], specs: [{ name: '500g', price: 49.9 }, { name: '1kg', price: 95.0 }], detailImages: 2 },

    { id: 301, name: '土鸡蛋 30枚', subtitle: '散养土鸡 营养丰富', categoryId: 3, emoji: '🥚', bg: 'bg-meat', spec: '30枚/盒', price: 29.9, oldPrice: 39.9, sales: 920, stock: 60, origin: '本地农场', storage: '冷藏', tags: ['recommend', 'hot'], specs: [{ name: '30枚', price: 29.9 }, { name: '10枚', price: 12.9 }], detailImages: 3 },
    { id: 302, name: '黑猪五花肉', subtitle: '纹理均匀 肥瘦相间', categoryId: 3, emoji: '🥩', bg: 'bg-meat', spec: '约400g/份', price: 32.9, oldPrice: 42.9, sales: 234, stock: 25, origin: '本地牧场', storage: '冷冻', tags: ['recommend'], specs: [{ name: '400g', price: 32.9 }, { name: '800g', price: 62.0 }], detailImages: 2 },
    { id: 303, name: '鲜鸡腿', subtitle: '新鲜现切 肉质紧实', categoryId: 3, emoji: '🍗', bg: 'bg-meat', spec: '约500g/份', price: 18.9, oldPrice: 25.9, sales: 345, stock: 40, origin: '本地', storage: '冷藏', tags: ['special'], specs: [{ name: '500g', price: 18.9 }], detailImages: 2 },

    { id: 401, name: '鲜活鲈鱼', subtitle: '活鱼现杀 鲜嫩肥美', categoryId: 4, emoji: '🐟', bg: 'bg-sea', spec: '约600g/条', price: 38.0, oldPrice: 48.0, sales: 167, stock: 12, origin: '近海养殖', storage: '鲜活', tags: ['recommend', 'new'], specs: [{ name: '1条', price: 38.0 }, { name: '2条', price: 72.0 }], detailImages: 2 },
    { id: 402, name: '北极甜虾', subtitle: '深海捕捞 鲜甜Q弹', categoryId: 4, emoji: '🦐', bg: 'bg-sea', spec: '500g/盒', price: 45.9, oldPrice: 59.9, sales: 198, stock: 20, origin: '北极', storage: '冷冻', tags: ['special'], specs: [{ name: '500g', price: 45.9 }], detailImages: 2 },

    { id: 501, name: '东北珍珠米 5kg', subtitle: '颗粒饱满 软糯香甜', categoryId: 5, emoji: '🍚', bg: 'bg-grain', spec: '5kg/袋', price: 39.9, oldPrice: 55.0, sales: 760, stock: 100, origin: '黑龙江五常', storage: '常温', tags: ['recommend', 'hot'], specs: [{ name: '5kg', price: 39.9 }, { name: '10kg', price: 75.0 }], detailImages: 2 },
    { id: 502, name: '特级初榨橄榄油', subtitle: '西班牙进口 冷榨', categoryId: 5, emoji: '🫒', bg: 'bg-grain', spec: '750ml/瓶', price: 68.0, oldPrice: 89.0, sales: 123, stock: 35, origin: '西班牙', storage: '常温', tags: ['new'], specs: [{ name: '750ml', price: 68.0 }], detailImages: 2 },

    { id: 601, name: '鲜牛奶 950ml', subtitle: '巴氏杀菌 每日鲜配', categoryId: 6, emoji: '🥛', bg: 'bg-milk', spec: '950ml/瓶', price: 15.9, oldPrice: 19.9, sales: 1100, stock: 80, origin: '本地牧场', storage: '冷藏', tags: ['recommend', 'hot'], specs: [{ name: '950ml', price: 15.9 }, { name: '950ml×3', price: 45.0 }], detailImages: 2 },
    { id: 602, name: '原味酸奶', subtitle: '0添加 活菌发酵', categoryId: 6, emoji: '🍶', bg: 'bg-milk', spec: '200g×4杯', price: 12.9, oldPrice: 16.9, sales: 456, stock: 55, origin: '本地', storage: '冷藏', tags: ['special'], specs: [{ name: '4杯', price: 12.9 }], detailImages: 2 },

    { id: 701, name: '每日坚果', subtitle: '混合果仁 30g×7包', categoryId: 7, emoji: '🥜', bg: 'bg-snack', spec: '210g/盒', price: 29.9, oldPrice: 45.0, sales: 580, stock: 90, origin: '进口原料', storage: '常温', tags: ['recommend', 'special'], specs: [{ name: '7包', price: 29.9 }, { name: '30包', price: 99.0 }], detailImages: 2 },
    { id: 702, name: '鲜榨橙汁', subtitle: 'NFC非浓缩还原', categoryId: 7, emoji: '🧃', bg: 'bg-snack', spec: '300ml/瓶', price: 9.9, oldPrice: 13.9, sales: 320, stock: 60, origin: '江西赣南', storage: '冷藏', tags: ['new'], specs: [{ name: '1瓶', price: 9.9 }, { name: '6瓶', price: 55.0 }], detailImages: 2 },

    { id: 801, name: '竹纤维抽纸 30包', subtitle: '柔韧亲肤 不掉屑', categoryId: 8, emoji: '🧻', bg: 'bg-daily', spec: '30包/箱', price: 24.9, oldPrice: 39.9, sales: 890, stock: 120, origin: '国产', storage: '常温', tags: ['recommend', 'hot'], specs: [{ name: '30包', price: 24.9 }], detailImages: 2 },
    { id: 802, name: '洗洁精 2kg', subtitle: '食品级配方 温和不伤手', categoryId: 8, emoji: '🧴', bg: 'bg-daily', spec: '2kg/瓶', price: 12.9, oldPrice: 19.9, sales: 340, stock: 70, origin: '国产', storage: '常温', tags: ['special'], specs: [{ name: '2kg', price: 12.9 }], detailImages: 2 },
  ];

  const BANNERS = [
    { id: 1, title: '今日特价 鲜果直采', subtitle: '车厘子低至49.9元', emoji: '🍒', bg: 'bg-coral', link: '#/product/203' },
    { id: 2, title: '邻里拼团 9.9元起', subtitle: '邻居一起买更便宜', emoji: '🛒', bg: 'bg-green', link: '#/group-buy' },
    { id: 3, title: '新人首单立减5元', subtitle: '30分钟极速送达', emoji: '🎁', bg: 'bg-gold', link: '#/home' },
  ];

  const REVIEWS = {
    101: [
      { id: 1, name: '李妈妈', avatar: '👩', stars: 5, text: '小番茄很甜很新鲜，孩子抢着吃，明天还要买！', date: '2026-06-30' },
      { id: 2, name: '张先生', avatar: '👨', stars: 5, text: '个头均匀，沙瓤的，比超市便宜还好。', date: '2026-06-29' },
      { id: 3, name: '王阿姨', avatar: '👵', stars: 4, text: '总体不错，有几个略酸，但很新鲜。', date: '2026-06-28' },
    ],
    201: [
      { id: 4, name: '宝妈联盟', avatar: '👩', stars: 5, text: '烟台苹果就是脆，全家都爱吃，已经回购三次了。', date: '2026-07-01' },
      { id: 5, name: '隔壁老王', avatar: '🧑', stars: 5, text: '甜度高，汁水足，团长推荐得没错。', date: '2026-06-30' },
    ],
  };

  const GROUP_BUYS = [
    { id: 1, productId: 201, name: '红富士苹果 1kg', emoji: '🍎', bg: 'bg-fruit', groupPrice: 9.9, originalPrice: 19.9, targetCount: 10, joinedCount: 7, expireAt: Date.now() + 3 * 3600 * 1000, specs: [{ name: '1kg', price: 9.9 }] },
    { id: 2, productId: 501, name: '东北珍珠米 5kg', emoji: '🍚', bg: 'bg-grain', groupPrice: 29.9, originalPrice: 55.0, targetCount: 20, joinedCount: 12, expireAt: Date.now() + 8 * 3600 * 1000, specs: [{ name: '5kg', price: 29.9 }] },
    { id: 3, productId: 601, name: '鲜牛奶 950ml', emoji: '🥛', bg: 'bg-milk', groupPrice: 12.9, originalPrice: 19.9, targetCount: 15, joinedCount: 9, expireAt: Date.now() + 1.5 * 3600 * 1000, specs: [{ name: '950ml', price: 12.9 }] },
    { id: 4, productId: 301, name: '土鸡蛋 30枚', emoji: '🥚', bg: 'bg-meat', groupPrice: 24.9, originalPrice: 39.9, targetCount: 8, joinedCount: 3, expireAt: Date.now() + 12 * 3600 * 1000, specs: [{ name: '30枚', price: 24.9 }] },
  ];

  const ORDERS = [
    {
      orderNo: 'O2026070214301', status: 50, statusText: '已完成', items: [
        { id: 101, name: '本地小番茄 500g', emoji: '🍅', bg: 'bg-veg', spec: '500g', price: 9.9, quantity: 2 },
        { id: 301, name: '土鸡蛋 30枚', emoji: '🥚', bg: 'bg-meat', spec: '30枚', price: 29.9, quantity: 1 },
      ], skuTotal: 49.7, deliveryFee: 0, discount: 2.0, payAmount: 47.7, createdAt: '2026-07-02 14:30', payTime: '2026-07-02 14:31', deliveredTime: '2026-07-02 14:58', completedTime: '2026-07-02 15:02', rider: { name: '小刘', phone: '138****8888', avatar: '🧑‍✈️' }, address: { name: '王小明', phone: '138****6666', detail: '阳光花园3栋2单元501室' },
    },
    {
      orderNo: 'O2026070309152', status: 30, statusText: '配送中', items: [
        { id: 201, name: '红富士苹果 1kg', emoji: '🍎', bg: 'bg-fruit', spec: '1kg', price: 12.9, quantity: 1 },
        { id: 601, name: '鲜牛奶 950ml', emoji: '🥛', bg: 'bg-milk', spec: '950ml', price: 15.9, quantity: 2 },
      ], skuTotal: 44.7, deliveryFee: 0, discount: 0, payAmount: 44.7, createdAt: '2026-07-03 09:15', payTime: '2026-07-03 09:16', rider: { name: '小陈', phone: '139****7777', avatar: '🧑‍✈️' }, address: { name: '王小明', phone: '138****6666', detail: '阳光花园3栋2单元501室' },
    },
    {
      orderNo: 'O2026070308303', status: 20, statusText: '待配送', items: [
        { id: 401, name: '鲜活鲈鱼', emoji: '🐟', bg: 'bg-sea', spec: '1条', price: 38.0, quantity: 1 },
        { id: 103, name: '本地青菜', emoji: '🥬', bg: 'bg-veg', spec: '1把', price: 3.9, quantity: 2 },
      ], skuTotal: 45.8, deliveryFee: 0, discount: 0, payAmount: 45.8, createdAt: '2026-07-03 08:30', payTime: '2026-07-03 08:31', address: { name: '王小明', phone: '138****6666', detail: '阳光花园3栋2单元501室' },
    },
    {
      orderNo: 'O2026070210304', status: 10, statusText: '待付款', items: [
        { id: 701, name: '每日坚果', emoji: '🥜', bg: 'bg-snack', spec: '7包', price: 29.9, quantity: 1 },
      ], skuTotal: 29.9, deliveryFee: 0, discount: 0, payAmount: 29.9, createdAt: '2026-07-03 10:30', expireAt: Date.now() + 12 * 60 * 1000, address: { name: '王小明', phone: '138****6666', detail: '阳光花园3栋2单元501室' },
    },
  ];

  const COUPONS = [
    { id: 1, userCouponId: 1, name: '新人专享券', type: 1, faceValue: 5, minOrder: 20, desc: '满20元可用', validEnd: '2026-07-31', status: 0 },
    { id: 2, userCouponId: 2, name: '满30减2', type: 1, faceValue: 2, minOrder: 30, desc: '满30元可用', validEnd: '2026-07-15', status: 0 },
    { id: 3, userCouponId: 3, name: '满50减8', type: 1, faceValue: 8, minOrder: 50, desc: '满50元可用', validEnd: '2026-07-20', status: 0 },
    { id: 4, userCouponId: 4, name: '免配送费券', type: 3, faceValue: 0, minOrder: 0, desc: '免配送费', validEnd: '2026-07-10', status: 0 },
  ];

  const ADDRESSES = [
    { id: 1, name: '王小明', phone: '138****6666', detail: '阳光花园3栋2单元501室', tag: '家', isDefault: true },
    { id: 2, name: '王小明', phone: '138****6666', detail: '科技大厦A座18楼', tag: '公司', isDefault: false },
  ];

  const USER = {
    id: 10001, nickName: '王小明', avatar: '😊', phone: '138****6666',
    memberLevel: 2, memberLevelName: '老熟人', points: 386,
    totalConsume: 456.8, orderCount: 12, couponCount: 4,
  };

  const COMMUNITY = {
    id: 1, name: '阳光小区', eta: 30, city: '深圳市南山区', address: '南山区阳光小区',
  };

  // ---- Mock router ----
  function mockHandler(method, path, body) {
    // Auth
    if (path === '/auth/login' && method === 'POST') {
      if (!body || !body.phone || !body.password) return undefined;
      setToken('mock-token-' + Date.now());
      return { token: getToken(), userId: USER.id, nickName: USER.nickName, avatarUrl: USER.avatar, phone: USER.phone, memberLevel: USER.memberLevel, points: USER.points };
    }
    if (path === '/auth/login-guest' && method === 'POST') {
      setToken('mock-token-' + Date.now());
      return { token: getToken(), userId: USER.id, nickName: USER.nickName, avatarUrl: USER.avatar, phone: USER.phone, memberLevel: USER.memberLevel, points: USER.points };
    }
    if (path === '/auth/register' && method === 'POST') {
      setToken('mock-token-' + Date.now());
      return { token: getToken(), userId: 9999, nickName: body.nickName || ('用户' + body.phone.slice(-4)), phone: body.phone, memberLevel: 1, points: 0 };
    }
    if (path === '/user/profile') return USER;
    if (path === '/user/member') return { ...USER, levelBenefits: ['每月2张免配送费券', '生日礼券'] };

    // Community
    if (path === '/communities/current') return COMMUNITY;
    if (path === '/communities') return [COMMUNITY, { id: 2, name: '翠海花园', eta: 35, city: '深圳市南山区' }];

    // Categories
    if (path === '/categories') return CATEGORIES;

    // Products
    if (path.startsWith('/products/') ) {
      const id = parseInt(path.split('/')[2]);
      const p = PRODUCTS.find(x => x.id === id);
      if (p) return { ...p, reviews: REVIEWS[id] || [], leader: { name: '李团长', avatar: '👩‍🌾', text: '我家孩子吃了三箱了，真的甜！品质放心。' } };
    }
    if (path === '/products') return { list: PRODUCTS, total: PRODUCTS.length };

    // Banners
    if (path === '/banners') return BANNERS;

    // Cart (mock local cart in memory)
    if (path === '/cart') return getMockCart();
    if (path === '/cart/add' && method === 'POST') { addMockCart(body); return getMockCart(); }
    if (path === '/cart/update' && method === 'POST') { updateMockCart(body); return getMockCart(); }
    if (path.startsWith('/cart/') && method === 'DELETE') { removeMockCart(parseInt(path.split('/')[2])); return getMockCart(); }
    if (path === '/cart/clear' && method === 'DELETE') { mockCart = []; return getMockCart(); }

    // Orders
    if (path === '/orders' && method === 'GET') return ORDERS;
    if (path === '/orders' && method === 'POST') {
      const no = 'O' + Date.now();
      const order = {
        orderNo: no, status: 10, statusText: '待付款',
        items: (body.items || []).map(it => {
          const p = PRODUCTS.find(x => x.id === it.id);
          return { ...it, name: p?.name || '', emoji: p?.emoji || '📦', bg: p?.bg || 'bg-paper', spec: it.spec || p?.spec || '' };
        }),
        skuTotal: body.skuTotal || 0, deliveryFee: body.deliveryFee || 0, discount: body.discount || 0,
        payAmount: body.payAmount || 0, createdAt: new Date().toLocaleString('zh-CN'),
        address: body.address, expireAt: Date.now() + 15 * 60 * 1000,
      };
      ORDERS.unshift(order);
      return order;
    }
    if (path.startsWith('/orders/') && method === 'GET') {
      const no = path.split('/')[2];
      return ORDERS.find(o => o.orderNo === no) || ORDERS[0];
    }
    if (path.includes('/cancel') && method === 'POST') {
      const no = path.split('/')[2];
      const o = ORDERS.find(x => x.orderNo === no);
      if (o) { o.status = 99; o.statusText = '已取消'; }
      return o;
    }
    if (path.includes('/pay') && method === 'POST') {
      const no = path.split('/')[2];
      const o = ORDERS.find(x => x.orderNo === no);
      if (o) { o.status = 20; o.statusText = '待配送'; o.payTime = new Date().toLocaleString('zh-CN'); }
      return { success: true, orderNo: no };
    }
    if (path.includes('/confirm') && method === 'POST') {
      const no = path.split('/')[2];
      const o = ORDERS.find(x => x.orderNo === no);
      if (o) { o.status = 50; o.statusText = '已完成'; o.completedTime = new Date().toLocaleString('zh-CN'); }
      return o;
    }

    // Addresses
    if (path === '/addresses') return ADDRESSES;
    if (path === '/addresses' && method === 'POST') {
      const a = { id: Date.now(), isDefault: false, ...body };
      ADDRESSES.push(a); return a;
    }
    if (path.startsWith('/addresses/') && method === 'PUT') {
      const id = parseInt(path.split('/')[2]);
      const idx = ADDRESSES.findIndex(a => a.id === id);
      if (idx >= 0) ADDRESSES[idx] = { ...ADDRESSES[idx], ...body };
      return ADDRESSES[idx];
    }
    if (path.startsWith('/addresses/') && method === 'DELETE') {
      const id = parseInt(path.split('/')[2]);
      const idx = ADDRESSES.findIndex(a => a.id === id);
      if (idx >= 0) ADDRESSES.splice(idx, 1);
      return { success: true };
    }

    // Coupons
    if (path === '/coupons') return COUPONS;
    if (path === '/coupons/available') return COUPONS.filter(c => c.status === 0);

    // Group buy
    if (path === '/group-buys') return GROUP_BUYS;
    if (path.startsWith('/group-buys/') ) {
      const id = parseInt(path.split('/')[2]);
      const gb = GROUP_BUYS.find(x => x.id === id);
      if (gb) return { ...gb, participants: Array.from({ length: gb.joinedCount }, (_, i) => ({ name: '邻居' + (i + 1), avatar: ['👩', '👨', '👵', '🧑', '👱‍♀️'][i % 5] })) };
    }
    if (path.includes('/join') && method === 'POST') {
      const id = parseInt(path.split('/')[2]);
      const gb = GROUP_BUYS.find(x => x.id === id);
      if (gb) gb.joinedCount++;
      return { success: true, joinedCount: gb?.joinedCount, targetCount: gb?.targetCount };
    }

    // Points
    if (path === '/user/points') return { points: USER.points, history: [{ desc: '消费获得', amount: 38, time: '2026-07-02' }, { desc: '每日签到', amount: 5, time: '2026-07-03' }, { desc: '首次评价', amount: 10, time: '2026-07-01' }] };

    return undefined;
  }

  // ---- Mock cart helpers ----
  let mockCart = [];
  function getMockCart() {
    return mockCart.map(item => {
      const p = PRODUCTS.find(x => x.id === item.id);
      return { ...item, name: p?.name, emoji: p?.emoji, bg: p?.bg, price: p?.price, stock: p?.stock, spec: item.spec || p?.spec };
    });
  }
  function addMockCart(body) {
    const exist = mockCart.find(x => x.id === body.id && x.spec === (body.spec || ''));
    if (exist) exist.quantity += body.quantity || 1;
    else mockCart.push({ id: body.id, spec: body.spec || '', quantity: body.quantity || 1, selected: true });
  }
  function updateMockCart(body) {
    const item = mockCart.find(x => x.id === body.id && x.spec === (body.spec || ''));
    if (item) { if (body.quantity !== undefined) item.quantity = body.quantity; if (body.selected !== undefined) item.selected = body.selected; }
  }
  function removeMockCart(idx) { if (mockCart[idx]) mockCart.splice(idx, 1); }

  // ---- Product Transformer (API snake_case → frontend camelCase) ----
  const CATEGORY_EMOJI = {
    '蔬菜': ['🍅', '🥦', '🥬', '🥔', '🥒', '🍆', '🌶', '🫑'],
    '水果': ['🍎', '🍍', '🍒', '🍌', '🍇', '🥭', '🍊', '🍓'],
    '肉禽蛋': ['🥚', '🥩', '🍗', '🥓', '🍖'],
    '水产': ['🐟', '🦐', '🦀', '🐙', '🦑', '🐠'],
    '粮油调味': ['🍚', '🫒', '🧂', '🌾', '🍞'],
    '乳制品': ['🥛', '🍶', '🧀', '🍦'],
    '零食饮料': ['🥜', '🧃', '🍪', '🍫', '🥤'],
    '日用百货': ['🧻', '🧴', '🧹', '🧽'],
  };
  const CATEGORY_BG = {
    '蔬菜': 'bg-veg', '水果': 'bg-fruit', '肉禽蛋': 'bg-meat', '水产': 'bg-sea',
    '粮油调味': 'bg-grain', '乳制品': 'bg-milk', '零食饮料': 'bg-snack', '日用百货': 'bg-daily',
  };

  function transformProduct(p) {
    if (!p || !p.id) return p;
    // If already transformed (has price field), skip
    if (p.price !== undefined && p.emoji !== undefined) return p;

    const catName = p.category_name || p.categoryName || '';
    // Use product-specific emoji first, fall back to category-level
    const inferred = inferEmojiBg(p.name || '');
    const emoji = inferred.emoji !== '🛒' ? inferred.emoji : (CATEGORY_EMOJI[catName] || ['🛒'])[0];
    const bg = inferred.bg !== 'bg-veg' || inferred.emoji !== '🛒' ? inferred.bg : (CATEGORY_BG[catName] || 'bg-veg');

    const tags = [];
    if (p.is_hot || p.isHot) tags.push('hot');
    if (p.is_recommend || p.isRecommend) tags.push('recommend');

    return {
      ...p,
      id: p.id,
      name: p.name,
      subtitle: p.subtitle || '',
      categoryId: p.category_id || p.categoryId || 0,
      categoryName: catName,
      mainImage: p.main_image || p.mainImage || '',
      emoji: p.emoji || emoji,
      bg: p.bg || bg,
      spec: p.spec || p.unit || '',
      unit: p.unit || '',
      price: p.price !== undefined ? p.price : (p.sale_price || p.salePrice || 0),
      oldPrice: p.oldPrice !== undefined ? p.oldPrice : (p.market_price || p.marketPrice || 0),
      salePrice: p.sale_price || p.salePrice || p.price || 0,
      marketPrice: p.market_price || p.marketPrice || p.oldPrice || 0,
      sales: p.sales !== undefined ? p.sales : (p.sales_count || p.salesCount || 0),
      stock: p.stock !== undefined ? p.stock : (p.availableStock !== undefined ? p.availableStock : (p.available_stock || 0)),
      origin: p.origin || '',
      storage: p.storage || p.storage_type || '',
      tags: p.tags || tags,
      specs: p.specs || [],
      inStock: p.inStock !== undefined ? p.inStock : true,
    };
  }

  // ---- Emoji / bg inference by SKU name (mirrors server-side groupbuys.js) ----
  function inferEmojiBg(name) {
    const n = name || '';
    let bg = 'bg-veg', emoji = '🛒';
    // Product-specific emojis first
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
    else if (n.includes('鲈鱼')) { bg = 'bg-sea'; emoji = '🐟'; }
    else if (n.includes('三文鱼')) { bg = 'bg-sea'; emoji = '🐟'; }
    else if (n.includes('米')) { bg = 'bg-grain'; emoji = '🍚'; }
    else if (n.includes('油')) { bg = 'bg-grain'; emoji = '🫗'; }
    else if (n.includes('酱油')) { bg = 'bg-grain'; emoji = '🧴'; }
    else if (n.includes('醋')) { bg = 'bg-grain'; emoji = '🧴'; }
    else if (n.includes('牛奶')) { bg = 'bg-milk'; emoji = '🥛'; }
    else if (n.includes('酸奶')) { bg = 'bg-milk'; emoji = '🥛'; }
    else if (n.includes('奶酪')) { bg = 'bg-milk'; emoji = '🧀'; }
    else if (n.includes('可乐')) { bg = 'bg-snack'; emoji = '🥤'; }
    else if (n.includes('坚果')) { bg = 'bg-snack'; emoji = '🥜'; }
    else if (n.includes('饼干')) { bg = 'bg-snack'; emoji = '🍪'; }
    else if (n.includes('山泉')) { bg = 'bg-snack'; emoji = '💧'; }
    else if (n.includes('纸巾')) { bg = 'bg-daily'; emoji = '🧻'; }
    else if (n.includes('洗衣')) { bg = 'bg-daily'; emoji = '🧺'; }
    else if (n.includes('垃圾袋')) { bg = 'bg-daily'; emoji = '🗑️'; }
    else if (n.includes('洗洁精')) { bg = 'bg-daily'; emoji = '🧴'; }
    return { emoji, bg };
  }

  // ---- Cart item transformer (handles both raw DB rows and API-formatted data) ----
  function transformCartItem(item) {
    if (!item) return item;
    const name = item.sku_name || item.name || '';
    const { emoji, bg } = inferEmojiBg(name);
    return {
      ...item,
      id: item.id !== undefined ? item.id : item.sku_id,
      skuId: item.skuId !== undefined ? item.skuId : item.sku_id,
      name: item.sku_name || item.name || '',
      image: item.sku_image || item.mainImage || item.image || '',
      spec: item.sku_spec_name || item.specName || item.spec || '',
      price: item.price,
      marketPrice: item.marketPrice || item.market_price,
      quantity: item.quantity,
      selected: item.selected !== undefined ? item.selected : true,
      stock: item.availableStock || item.stock || 99,
      emoji: item.emoji !== undefined ? item.emoji : emoji,
      bg: item.bg !== undefined ? item.bg : bg,
    };
  }

  // ---- Address transformer (API snake_case → frontend camelCase) ----
  function transformAddress(addr) {
    if (!addr) return addr;
    const isDefault = addr.is_default !== undefined
      ? !!addr.is_default
      : (addr.isDefault !== undefined ? addr.isDefault : false);
    return {
      ...addr,
      id: addr.id,
      name: addr.contact_name || addr.name || '',
      phone: addr.contact_phone || addr.phone || '',
      detail: addr.detail_address || addr.detail || '',
      isDefault: isDefault,
    };
  }

  // ---- Order status text map ----
  const STATUS_TEXT = { 10: '待付款', 20: '待配送', 30: '配送中', 40: '待确认', 50: '已完成', 99: '已取消' };

  // ---- Order detail transformer (API snake_case → frontend camelCase) ----
  function transformOrderDetail(order) {
    if (!order) return order;
    const items = (order.items || []).map(it => {
      const name = it.sku_name || it.name || '';
      const { emoji, bg } = inferEmojiBg(name);
      return {
        ...it,
        id: it.sku_id !== undefined ? it.sku_id : it.id,
        name: it.sku_name || it.name || '',
        spec: it.sku_spec_name || it.spec || '',
        emoji: it.emoji !== undefined ? it.emoji : emoji,
        bg: it.bg !== undefined ? it.bg : bg,
      };
    });

    let address = order.address;
    if (address && (
      address.contact_name !== undefined ||
      address.contact_phone !== undefined ||
      address.detail_address !== undefined
    )) {
      address = transformAddress(address);
    }

    return {
      ...order,
      items,
      statusText: order.statusText || STATUS_TEXT[order.status] || '',
      skuTotal: order.skuTotalAmount !== undefined ? order.skuTotalAmount : order.skuTotal,
      address,
    };
  }

  // ---- Public API ----
  return {
    BASE_URL,
    getToken, setToken,
    get, post, put, del,
    transformProduct,
    transformCartItem,
    transformAddress,
    transformOrderDetail,

    // High-level methods (used by pages)
    login: (phone, password) => post('/auth/login', { phone, password }),
    register: (phone, password, nickName) => post('/auth/register', { phone, password, nickName }),
    loginGuest: () => post('/auth/login-guest', {}),
    getProfile: () => get('/user/profile'),
    updateProfile: (data) => put('/user/profile', data),
    getMember: () => get('/user/member'),
    getCommunity: () => get('/communities/current'),
    getCategories: () => get('/categories'),
    getProducts: async (params) => {
      const data = await get('/products' + (params ? '?' + new URLSearchParams(params).toString() : ''));
      if (data && data.list) {
        data.list = data.list.map(transformProduct);
      } else if (Array.isArray(data)) {
        return data.map(transformProduct);
      }
      return data;
    },
    getProduct: async (id) => {
      const resp = await get('/products/' + id);
      const product = resp && resp.data ? resp.data : resp;
      return transformProduct(product);
    },
    getBanners: () => get('/banners'),
    getCart: async () => {
      const data = await get('/cart');
      const items = Array.isArray(data) ? data : (data.list || []);
      return items.map(transformCartItem);
    },
    addToCart: (skuId, quantity, spec) => post('/cart/add', { skuId, quantity, skuSpecId: spec }),
    updateCart: (id, quantity, selected, spec) => put('/cart/update', { id, quantity, selected }),
    removeFromCart: (id) => del('/cart/remove', { id }),
    clearCart: () => del('/cart/remove', {}),
    getOrders: (status) => get('/orders' + (status ? '?status=' + status : '')),
    getOrder: async (no) => {
      const data = await get('/orders/' + no);
      return transformOrderDetail(data);
    },
    createOrder: (data) => post('/orders', data),
    cancelOrder: (no) => post('/orders/' + no + '/cancel', {}),
    payOrder: (no) => post('/orders/' + no + '/pay', {}),
    confirmOrder: (no) => post('/orders/' + no + '/confirm', {}),
    refundOrder: (no, data) => post('/orders/' + no + '/refund', data),
    reqProxyPay: (no) => post('/orders/' + no + '/req-proxy', {}),
    getProxyPay: (token) => get('/proxy-pay/' + token),
    doProxyPay: (token) => post('/proxy-pay/' + token + '/pay', {}),
    getMessages: () => get('/messages'),
    readMessage: (id) => post('/messages/' + id + '/read', {}),
    readAllMessages: () => post('/messages/read-all', {}),
    // 地图相关
    getCommunities: () => get('/products/communities'),
    locateCommunity: (lat, lng) => get('/products/locate-community?lat=' + lat + '&lng=' + lng),
    getRiderLocation: (orderNo) => get('/orders/' + orderNo + '/rider-location'),
    getAddresses: async () => {
      const data = await get('/addresses');
      const list = Array.isArray(data) ? data : (data.list || []);
      return list.map(transformAddress);
    },
    addAddress: (data) => post('/addresses', data),
    updateAddress: (id, data) => put('/addresses/' + id, data),
    deleteAddress: (id) => del('/addresses/' + id),
    getCoupons: () => get('/coupons'),
    getAvailableCoupons: () => get('/coupons/available'),
    getGroupBuys: () => get('/group-buys'),
    getGroupBuy: (id) => get('/group-buys/' + id),
    joinGroupBuy: (id) => post('/group-buys/' + id + '/join', {}),
    getPoints: () => get('/user/points'),

    // Expose mock data for direct use
    mock: { CATEGORIES, PRODUCTS, BANNERS, GROUP_BUYS, ORDERS, COUPONS, ADDRESSES, USER, COMMUNITY, REVIEWS },
  };
})();

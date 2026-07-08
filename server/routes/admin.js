const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error, now } = require('../helpers');
const { adminAuthMiddleware, generateAdminToken } = require('../middleware/auth');
const { createMessage } = require('./messages');
const bcrypt = require('bcryptjs');

// 所有后台接口需要管理员登录, 自动注入 req.adminScope (dataScope + scopeId)
router.use(adminAuthMiddleware);

/**
 * 构造数据范围过滤条件
 * @param {object} scope - req.adminScope
 * @param {object} fieldMap - 表字段映射, 如 { community: 'o.community_id', warehouse: 'o.warehouse_id' }
 * @returns {string} SQL 片段(已带占位符) + 绑定参数顺序对应
 *   返回 { sql: ' AND ...', params: [...] } 或 { sql: '', params: [] }
 */
function buildScopeFilter(scope, fieldMap) {
  if (!scope || scope.dataScope === 'all') return { sql: '', params: [] };
  if (scope.dataScope === 'site' && scope.scopeId) {
    // 站点 = 社区, 关联的 warehouse 通过 warehouse_coverage 反查
    // 优先用直接字段, 没有就用 community_id
    if (fieldMap.community) {
      return { sql: ` AND ${fieldMap.community} = ?`, params: [scope.scopeId] };
    }
  }
  // 站点管理员但无 scope_id, 拒绝返回任何数据
  if (scope && scope.dataScope === 'site' && !scope.scopeId) {
    return { sql: ' AND 1=0', params: [] };
  }
  return { sql: '', params: [] };
}

/* ==========================================================================
   商品管理
   ========================================================================== */

/**
 * GET /api/v1/admin/products
 */
router.get('/products', (req, res) => {
  const { page = 1, pageSize = 20, status, categoryId, keyword } = req.query;
  const offset = (page - 1) * pageSize;
  const scope = req.adminScope;

  // 站点管理员: 只能看本社区已配置的商品 (通过 community_sku 关联)
  let joinClause = '';
  let scopeWhere = '';
  const scopeParams = [];
  if (scope && scope.dataScope === 'site' && scope.scopeId) {
    joinClause = ` INNER JOIN community_sku cs ON cs.sku_id = s.id`;
    scopeWhere = ` AND cs.community_id = ?`;
    scopeParams.push(scope.scopeId);
  } else if (scope && scope.dataScope === 'site' && !scope.scopeId) {
    return success(res, { list: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize) });
  }

  let sql = `SELECT DISTINCT s.*, c.name as category_name FROM sku s ${joinClause} LEFT JOIN category c ON c.id = s.category_id WHERE 1=1${scopeWhere}`;
  const params = [...scopeParams];

  if (status) { sql += ` AND s.status = ?`; params.push(parseInt(status)); }
  if (categoryId) { sql += ` AND s.category_id = ?`; params.push(parseInt(categoryId)); }
  if (keyword) { sql += ` AND s.name LIKE ?`; params.push('%' + keyword + '%'); }

  sql += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const list = db.prepare(sql).all(...params);

  // 总数: 用相同 WHERE 重新计数
  let countSql = `SELECT COUNT(DISTINCT s.id) as total FROM sku s ${joinClause} WHERE 1=1${scopeWhere}`;
  const countParams = [...scopeParams];
  if (status) { countSql += ` AND s.status = ?`; countParams.push(parseInt(status)); }
  if (categoryId) { countSql += ` AND s.category_id = ?`; countParams.push(parseInt(categoryId)); }
  if (keyword) { countSql += ` AND s.name LIKE ?`; countParams.push('%' + keyword + '%'); }
  const totalRow = db.prepare(countSql).get(...countParams);

  return success(res, { list, total: totalRow.total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

/**
 * POST /api/v1/admin/products
 */
router.post('/products', (req, res) => {
  const { name, subtitle, categoryId, unit, costPrice, marketPrice, salePrice, commissionRate, origin, storageType, mainImage } = req.body;

  if (!name || !categoryId || !salePrice) {
    return error(res, '商品名称、分类、售价不能为空', 400);
  }

  const result = db.prepare(`
    INSERT INTO sku (spu_id, category_id, name, subtitle, main_image, origin, storage_type, unit, cost_price, market_price, sale_price, commission_rate, sales_count, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
  `).run(0, categoryId, name, subtitle || '', mainImage || '', origin || '', storageType || '', unit || '份', costPrice || 0, marketPrice || 0, salePrice, commissionRate || 8.00);

  return success(res, { id: result.lastInsertRowid }, '商品创建成功');
});

/**
 * PUT /api/v1/admin/products/:id
 */
router.put('/products/:id', (req, res) => {
  const { id } = req.params;
  const fields = ['name', 'subtitle', 'category_id', 'unit', 'cost_price', 'market_price', 'sale_price', 'commission_rate', 'origin', 'storage_type', 'main_image', 'status'];
  const updates = [];
  const params = [];

  fields.forEach(f => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(req.body[f]);
    }
  });

  if (!updates.length) return error(res, '没有需要更新的字段', 400);

  params.push(id);
  db.prepare(`UPDATE sku SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return success(res, { id: parseInt(id) }, '商品更新成功');
});

/**
 * PUT /api/v1/admin/products/:id/status
 */
router.put('/products/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  db.prepare(`UPDATE sku SET status = ? WHERE id = ?`).run(status, id);
  return success(res, { id: parseInt(id), status }, status === 1 ? '已上架' : '已下架');
});

/* ==========================================================================
   订单管理
   ========================================================================== */

/**
 * GET /api/v1/admin/orders
 */
router.get('/orders', (req, res) => {
  const { page = 1, pageSize = 20, status, communityId, keyword } = req.query;
  const offset = (page - 1) * pageSize;
  const scope = req.adminScope;

  let sql = `SELECT o.*, u.nick_name, u.phone, c.name as community_name FROM \`order\` o LEFT JOIN user u ON u.id = o.user_id LEFT JOIN community c ON c.id = o.community_id WHERE 1=1`;
  const params = [];

  // 数据范围: 站点管理员只能看本社区订单, 且 communityId 筛选被强制为本站点
  if (scope && scope.dataScope === 'site') {
    if (!scope.scopeId) {
      return success(res, { list: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize) });
    }
    sql += ` AND o.community_id = ?`;
    params.push(scope.scopeId);
  } else if (communityId) {
    sql += ` AND o.community_id = ?`;
    params.push(parseInt(communityId));
  }

  if (status) { sql += ` AND o.status = ?`; params.push(parseInt(status)); }
  if (keyword) { sql += ` AND (o.order_no LIKE ? OR u.phone LIKE ?)`; params.push('%' + keyword + '%', '%' + keyword + '%'); }

  sql += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const list = db.prepare(sql).all(...params);
  const itemStmt = db.prepare(`SELECT * FROM order_item WHERE order_id = ?`);
  list.forEach(o => { o.items = itemStmt.all(o.id); });

  return success(res, { list, total: list.length, page: parseInt(page), pageSize: parseInt(pageSize) });
});

/* ==========================================================================
   数据报表
   ========================================================================== */

/**
 * GET /api/v1/admin/reports/overview
 */
router.get('/reports/overview', (req, res) => {
  const { dateRange = 'today' } = req.query;
  const scope = req.adminScope;

  // 站点管理员: 限定本社区; user 表无 community_id, 新增用户通过 order 表反查
  let scopeWhere = '';
  let scopeParams = [];
  if (scope && scope.dataScope === 'site') {
    if (!scope.scopeId) {
      return success(res, { summary: { totalGmv: '0.00', totalOrders: 0, avgOrderValue: '0.00', totalUsers: 0, newUsers: 0 }, trend: [], categorySales: [] });
    }
    scopeWhere = ` AND o.community_id = ?`;
    scopeParams = [scope.scopeId];
  }

  let dateCondition = '';
  const today = new Date().toISOString().substring(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10);

  if (dateRange === 'today') dateCondition = `DATE(o.created_at) = '${today}'`;
  else if (dateRange === 'yesterday') dateCondition = `DATE(o.created_at) = '${yesterday}'`;
  else if (dateRange === 'last7days') dateCondition = `o.created_at >= datetime('now', '-7 days')`;

  const summary = db.prepare(`
    SELECT
      COUNT(o.id) as total_orders,
      COALESCE(SUM(o.pay_amount), 0) as total_gmv,
      COALESCE(AVG(o.pay_amount), 0) as avg_order_value,
      COUNT(DISTINCT o.user_id) as total_users
    FROM \`order\` o
    WHERE o.pay_status = 1 ${dateCondition ? 'AND ' + dateCondition : ''}${scopeWhere}
  `).get(...scopeParams);

  // newUsers: 超管=今天注册的用户数; 站点管理员=今天注册且在本社区下过单的用户数
  let newUsers;
  if (scope && scope.dataScope === 'site') {
    newUsers = db.prepare(`
      SELECT COUNT(DISTINCT u.id) as cnt
      FROM user u INNER JOIN \`order\` o ON o.user_id = u.id
      WHERE DATE(u.created_at) = ? AND o.community_id = ?
    `).get(today, scope.scopeId);
  } else {
    newUsers = db.prepare(`SELECT COUNT(*) as cnt FROM user WHERE DATE(created_at) = ?`).get(today);
  }

  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().substring(0, 10);
    const r = db.prepare(`SELECT COUNT(*) as orders, COALESCE(SUM(pay_amount), 0) as gmv FROM \`order\` WHERE DATE(created_at) = ? AND pay_status = 1${scopeWhere.replace(/o\.community_id/g, 'community_id')}`).get(d, ...scopeParams);
    trend.push({ date: d.substring(5), orders: r.orders, gmv: parseFloat(r.gmv).toFixed(2) });
  }

  const categorySales = db.prepare(`
    SELECT c.name, c.icon, COUNT(oi.id) as cnt, COALESCE(SUM(oi.price * oi.quantity), 0) as amount
    FROM order_item oi
    JOIN sku s ON s.id = oi.sku_id
    JOIN category c ON c.id = s.category_id
    JOIN \`order\` o ON o.id = oi.order_id
    WHERE o.pay_status = 1 ${dateCondition ? 'AND ' + dateCondition : ''}${scopeWhere}
    GROUP BY c.id ORDER BY amount DESC LIMIT 8
  `).all(...scopeParams);

  return success(res, {
    summary: {
      totalGmv: parseFloat(summary.total_gmv).toFixed(2),
      totalOrders: summary.total_orders,
      avgOrderValue: parseFloat(summary.avg_order_value).toFixed(2),
      totalUsers: summary.total_users,
      newUsers: newUsers.cnt
    },
    trend,
    categorySales
  });
});

/* ==========================================================================
   团长管理
   ========================================================================== */

/**
 * GET /api/v1/admin/leaders
 */
router.get('/leaders', (req, res) => {
  const { status } = req.query;
  const scope = req.adminScope;

  let sql = `SELECT l.*, u.nick_name, u.phone, c.name as community_name, (SELECT COUNT(*) FROM \`order\` o WHERE o.leader_id = l.id) as order_count FROM leader l LEFT JOIN user u ON u.id = l.user_id LEFT JOIN community c ON c.id = l.community_id WHERE 1=1`;
  const params = [];
  if (scope && scope.dataScope === 'site') {
    if (!scope.scopeId) return success(res, { list: [] });
    sql += ` AND l.community_id = ?`;
    params.push(scope.scopeId);
  }
  if (status) { sql += ` AND l.status = ?`; params.push(parseInt(status)); }
  sql += ` ORDER BY l.total_commission DESC`;

  const list = db.prepare(sql).all(...params);
  return success(res, { list });
});

/**
 * PUT /api/v1/admin/leaders/:id/status
 */
router.put('/leaders/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  db.prepare(`UPDATE leader SET status = ? WHERE id = ?`).run(status, id);
  return success(res, { id: parseInt(id), status }, '状态已更新');
});

/* ==========================================================================
   优惠券管理
   ========================================================================== */

/**
 * GET /api/v1/admin/coupons
 */
router.get('/coupons', (req, res) => {
  const list = db.prepare(`SELECT * FROM coupon ORDER BY created_at DESC`).all();
  return success(res, { list });
});

/**
 * POST /api/v1/admin/coupons
 */
router.post('/coupons', (req, res) => {
  const { name, type, faceValue, minOrderAmount, totalCount, perUserLimit, validDays } = req.body;
  const validEnd = new Date(Date.now() + (validDays || 30) * 86400000)
    .toISOString().replace('T', ' ').substring(0, 19);
  const result = db.prepare(`
    INSERT INTO coupon (name, type, face_value, min_order_amount, total_count, issued_count, valid_start, valid_end, status, created_at)
    VALUES (?, ?, ?, ?, ?, 0, datetime('now'), ?, 1, datetime('now'))
  `).run(name, type || 1, faceValue || 0, minOrderAmount || 0, totalCount || 0, validEnd);
  return success(res, { id: result.lastInsertRowid }, '优惠券创建成功');
});

/* ==========================================================================
   骑手管理
   ========================================================================== */

/**
 * GET /api/v1/admin/riders
 */
router.get('/riders', (req, res) => {
  const { status, page = 1, pageSize = 20 } = req.query;
  const offset = (page - 1) * pageSize;
  const scope = req.adminScope;

  // 站点管理员: 只看本社区关联前置仓的骑手 (通过 warehouse_coverage 反查)
  let scopeJoin = '';
  let scopeWhere = '';
  const scopeParams = [];
  if (scope && scope.dataScope === 'site') {
    if (!scope.scopeId) return success(res, { list: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize) });
    scopeJoin = ` INNER JOIN warehouse_coverage wc ON wc.warehouse_id = r.warehouse_id`;
    scopeWhere = ` AND wc.community_id = ?`;
    scopeParams.push(scope.scopeId);
  }

  let sql = `
    SELECT DISTINCT r.*, w.name as warehouse_name
    FROM rider r
    ${scopeJoin}
    LEFT JOIN warehouse w ON w.id = r.warehouse_id
    WHERE 1=1${scopeWhere}
  `;
  const params = [...scopeParams];

  if (status) {
    sql += ' AND r.status = ?';
    params.push(parseInt(status));
  }

  const countSql = `SELECT COUNT(DISTINCT r.id) as total FROM rider r ${scopeJoin} WHERE 1=1${scopeWhere}${status ? ' AND r.status = ?' : ''}`;
  const countParams = [...scopeParams];
  if (status) countParams.push(parseInt(status));
  const { total } = db.prepare(countSql).get(...countParams);

  sql += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(pageSize), offset);

  const riders = db.prepare(sql).all(...params);

  // Get delivery stats for each rider
  const result = riders.map(r => {
    const stats = db.prepare(`
      SELECT COUNT(*) as total_orders,
             SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) as completed_orders
      FROM rider_delivery WHERE rider_id = ?
    `).get(r.id);

    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      warehouseId: r.warehouse_id,
      warehouseName: r.warehouse_name,
      status: r.status,
      currentOrders: r.current_orders,
      totalOrders: stats.total_orders || 0,
      completedOrders: stats.completed_orders || 0,
      createdAt: r.created_at,
    };
  });

  return success(res, { list: result, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

/**
 * POST /api/v1/admin/riders
 */
router.post('/riders', (req, res) => {
  const { name, phone, warehouseId, password } = req.body;

  if (!name || !warehouseId) {
    return error(res, '姓名和前置仓不能为空', 400);
  }

  const passwordHash = password ? bcrypt.hashSync(password, 10) : bcrypt.hashSync('123456', 10);
  const result = db.prepare(`
    INSERT INTO rider (name, phone, warehouse_id, password_hash, status, current_orders, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, 0, datetime('now'), datetime('now'))
  `).run(name, phone || '', warehouseId, passwordHash);

  return success(res, { id: result.lastInsertRowid }, '骑手添加成功');
});

/**
 * PUT /api/v1/admin/riders/:id/status
 */
router.put('/riders/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  db.prepare('UPDATE rider SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(status, id);
  return success(res, { id: parseInt(id), status }, '状态已更新');
});

/* ==========================================================================
   库存管理
   ========================================================================== */

/**
 * GET /api/v1/admin/inventory
 */
router.get('/inventory', (req, res) => {
  const { warehouseId, page = 1, pageSize = 20 } = req.query;
  const offset = (page - 1) * pageSize;
  const scope = req.adminScope;

  // 站点管理员: 限定本社区关联的前置仓 (warehouse_coverage)
  let scopeJoin = '';
  let scopeWhere = '';
  const scopeParams = [];
  if (scope && scope.dataScope === 'site') {
    if (!scope.scopeId) return success(res, { list: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize) });
    scopeJoin = ` INNER JOIN warehouse_coverage wc ON wc.warehouse_id = i.warehouse_id`;
    scopeWhere = ` AND wc.community_id = ?`;
    scopeParams.push(scope.scopeId);
  }

  let sql = `
    SELECT DISTINCT i.id, i.available_stock, i.locked_stock, i.warning_threshold, i.updated_at,
           s.name as sku_name, s.main_image, s.unit, s.sale_price, s.status as sku_status,
           w.name as warehouse_name,
           c.name as category_name
    FROM inventory i
    ${scopeJoin}
    INNER JOIN sku s ON s.id = i.sku_id
    INNER JOIN warehouse w ON w.id = i.warehouse_id
    LEFT JOIN category c ON c.id = s.category_id
    WHERE 1=1${scopeWhere}
  `;
  const params = [...scopeParams];

  // 站点管理员的 warehouseId 筛选必须是本社区关联的前置仓之一
  if (warehouseId) {
    sql += ' AND i.warehouse_id = ?';
    params.push(parseInt(warehouseId));
  }

  const countSql = `SELECT COUNT(DISTINCT i.id) as total FROM inventory i ${scopeJoin} WHERE 1=1${scopeWhere}${warehouseId ? ' AND i.warehouse_id = ?' : ''}`;
  const countParams = [...scopeParams];
  if (warehouseId) countParams.push(parseInt(warehouseId));
  const { total } = db.prepare(countSql).get(...countParams);

  sql += ' ORDER BY i.updated_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(pageSize), offset);

  const items = db.prepare(sql).all(...params);

  const result = items.map(i => ({
    id: i.id,
    skuName: i.sku_name,
    mainImage: i.main_image,
    unit: i.unit,
    salePrice: i.sale_price,
    skuStatus: i.sku_status,
    categoryName: i.category_name,
    warehouseName: i.warehouse_name,
    availableStock: i.available_stock,
    lockedStock: i.locked_stock,
    totalStock: i.available_stock + i.locked_stock,
    warningThreshold: i.warning_threshold,
    isLowStock: i.available_stock <= i.warning_threshold,
    updatedAt: i.updated_at,
  }));

  return success(res, { list: result, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

/**
 * PUT /api/v1/admin/inventory/:id
 * 更新库存数量
 */
router.put('/inventory/:id', (req, res) => {
  const { id } = req.params;
  const { availableStock, warningThreshold } = req.body;

  const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
  if (!item) {
    return error(res, '库存记录不存在', 404);
  }

  if (availableStock !== undefined) {
    db.prepare('UPDATE inventory SET available_stock = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(parseInt(availableStock), id);
  }

  if (warningThreshold !== undefined) {
    db.prepare('UPDATE inventory SET warning_threshold = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(parseInt(warningThreshold), id);
  }

  return success(res, { id: parseInt(id) }, '库存已更新');
});

/**
 * GET /api/v1/admin/warehouses
 * 获取仓库列表（用于筛选）
 */
router.get('/warehouses', (req, res) => {
  const list = db.prepare('SELECT id, name, address, status FROM warehouse ORDER BY id').all();
  return success(res, { list });
});

/* ==========================================================================
   管理员登录
   ========================================================================== */

/**
 * POST /api/v1/admin/login
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return error(res, '用户名和密码不能为空', 400);
  }

  const admin = db.prepare(`
    SELECT a.*, r.name as role_name, r.permissions, r.data_scope
    FROM admin_user a
    LEFT JOIN admin_role r ON r.id = a.role_id
    WHERE a.username = ?
  `).get(username);

  if (!admin) {
    return error(res, '账号或密码错误', 400);
  }
  if (admin.status !== 1) {
    return error(res, '账号已被禁用', 400);
  }

  const ok = bcrypt.compareSync(password, admin.password);
  if (!ok) {
    return error(res, '账号或密码错误', 400);
  }

  db.prepare(`UPDATE admin_user SET updated_at = ? WHERE id = ?`).run(now(), admin.id);

  const token = generateAdminToken(admin.id);
  let permissions = [];
  try { permissions = JSON.parse(admin.permissions || '[]'); } catch (e) {}

  const dataScope = admin.data_scope || 'all';
  return success(res, {
    token,
    admin: {
      id: admin.id,
      username: admin.username,
      realName: admin.real_name,
      roleId: admin.role_id,
      roleName: admin.role_name,
      permissions,
      dataScope,
      scopeId: admin.scope_id
    }
  }, '登录成功');
});

/* ==========================================================================
   Banner 管理
   ========================================================================== */

/**
 * GET /api/v1/admin/banners
 */
router.get('/banners', (req, res) => {
  const { status } = req.query;
  const scope = req.adminScope;
  let sql = `SELECT * FROM banner WHERE 1=1`;
  const params = [];

  // 站点管理员: 看全站 Banner (community_ids 为空) 或 community_ids 含本社区 ID
  if (scope && scope.dataScope === 'site') {
    if (!scope.scopeId) return success(res, { list: [] });
    sql += ` AND (community_ids IS NULL OR community_ids = '' OR (',' || community_ids || ',') LIKE ?)`;
    params.push(`%,${scope.scopeId},%`);
  }
  if (status !== undefined && status !== '') {
    sql += ` AND status = ?`;
    params.push(parseInt(status));
  }
  sql += ` ORDER BY sort_order ASC, id DESC`;
  const list = db.prepare(sql).all(...params);
  return success(res, { list });
});

/**
 * POST /api/v1/admin/banners
 */
router.post('/banners', (req, res) => {
  const { title, subtitle, image, bg, linkType, linkValue, sortOrder, communityIds, validStart, validEnd } = req.body;
  if (!title) {
    return error(res, 'Banner 标题不能为空', 400);
  }
  const result = db.prepare(`
    INSERT INTO banner (title, subtitle, image, bg, link_type, link_value, sort_order, community_ids, status, valid_start, valid_end, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).run(
    title,
    subtitle || '',
    image || '',
    bg || 'banner-fresh',
    linkType || null,
    linkValue || null,
    sortOrder || 0,
    communityIds || '',
    validStart || null,
    validEnd || null,
    now(),
    now()
  );
  return success(res, { id: result.lastInsertRowid }, 'Banner 创建成功');
});

/**
 * PUT /api/v1/admin/banners/:id
 */
router.put('/banners/:id', (req, res) => {
  const { id } = req.params;
  const fields = ['title', 'subtitle', 'image', 'bg', 'link_type', 'link_value', 'sort_order', 'community_ids', 'status', 'valid_start', 'valid_end'];
  const updates = [];
  const params = [];
  fields.forEach(f => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(req.body[f]);
    }
  });
  if (!updates.length) {
    return error(res, '没有需要更新的字段', 400);
  }
  updates.push(`updated_at = ?`);
  params.push(now(), id);
  db.prepare(`UPDATE banner SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return success(res, { id: parseInt(id) }, 'Banner 更新成功');
});

/**
 * DELETE /api/v1/admin/banners/:id
 */
router.delete('/banners/:id', (req, res) => {
  const { id } = req.params;
  db.prepare(`DELETE FROM banner WHERE id = ?`).run(id);
  return success(res, { id: parseInt(id) }, 'Banner 已删除');
});

/**
 * PUT /api/v1/admin/banners/:id/status
 */
router.put('/banners/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  db.prepare(`UPDATE banner SET status = ?, updated_at = ? WHERE id = ?`).run(status, now(), id);
  return success(res, { id: parseInt(id), status }, status === 1 ? '已上线' : '已下线');
});

/* ==========================================================================
   会员规则管理
   ========================================================================== */

/**
 * GET /api/v1/admin/member-rules
 */
router.get('/member-rules', (req, res) => {
  const list = db.prepare(`SELECT * FROM member_rule ORDER BY level ASC`).all();
  return success(res, { list });
});

/**
 * PUT /api/v1/admin/member-rules/:id
 */
router.put('/member-rules/:id', (req, res) => {
  const { id } = req.params;
  const { name, minConsume, minOrders, discountRate, freeDeliveryCount, prioritySupport, status } = req.body;
  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (minConsume !== undefined) { updates.push('min_consume = ?'); params.push(parseFloat(minConsume)); }
  if (minOrders !== undefined) { updates.push('min_orders = ?'); params.push(parseInt(minOrders)); }
  if (discountRate !== undefined) { updates.push('discount_rate = ?'); params.push(parseFloat(discountRate)); }
  if (freeDeliveryCount !== undefined) { updates.push('free_delivery_count = ?'); params.push(parseInt(freeDeliveryCount)); }
  if (prioritySupport !== undefined) { updates.push('priority_support = ?'); params.push(prioritySupport ? 1 : 0); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status ? 1 : 0); }
  if (!updates.length) {
    return error(res, '没有需要更新的字段', 400);
  }
  updates.push('updated_at = ?');
  params.push(now(), id);
  db.prepare(`UPDATE member_rule SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return success(res, { id: parseInt(id) }, '会员规则已更新');
});

/* ==========================================================================
   社区-SKU 管理 (千区千面)
   ========================================================================== */

/**
 * GET /api/v1/admin/community-sku?communityId=X
 */
router.get('/community-sku', (req, res) => {
  const { communityId } = req.query;
  if (!communityId) {
    return error(res, 'communityId 不能为空', 400);
  }
  const list = db.prepare(`
    SELECT cs.*, s.name as sku_name, s.main_image, s.unit, s.sale_price, s.status as sku_status
    FROM community_sku cs
    INNER JOIN sku s ON s.id = cs.sku_id
    WHERE cs.community_id = ?
    ORDER BY cs.sort_order ASC, cs.id DESC
  `).all(communityId);
  return success(res, { list });
});

/**
 * POST /api/v1/admin/community-sku
 */
router.post('/community-sku', (req, res) => {
  const { communityId, skuId, isRecommend, isHot, sortOrder } = req.body;
  if (!communityId || !skuId) {
    return error(res, 'communityId 和 skuId 不能为空', 400);
  }
  const existing = db.prepare(`SELECT id FROM community_sku WHERE community_id = ? AND sku_id = ?`).get(communityId, skuId);
  if (existing) {
    return error(res, '该商品已在此社区配置中', 400);
  }
  const result = db.prepare(`
    INSERT INTO community_sku (community_id, sku_id, is_recommend, is_hot, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(communityId, skuId, isRecommend ? 1 : 0, isHot ? 1 : 0, sortOrder || 0, now(), now());
  return success(res, { id: result.lastInsertRowid }, '已添加到社区商品');
});

/**
 * DELETE /api/v1/admin/community-sku/:id
 */
router.delete('/community-sku/:id', (req, res) => {
  const { id } = req.params;
  db.prepare(`DELETE FROM community_sku WHERE id = ?`).run(id);
  return success(res, { id: parseInt(id) }, '已从社区商品中移除');
});

/**
 * POST /api/v1/admin/community-sku/batch
 */
router.post('/community-sku/batch', (req, res) => {
  const { communityId, skuIds } = req.body;
  if (!communityId || !Array.isArray(skuIds) || !skuIds.length) {
    return error(res, 'communityId 和 skuIds 不能为空', 400);
  }
  const insert = db.prepare(`
    INSERT OR IGNORE INTO community_sku (community_id, sku_id, is_recommend, is_hot, sort_order, created_at, updated_at)
    VALUES (?, ?, 0, 0, 0, ?, ?)
  `);
  let added = 0;
  const tx = db.transaction(() => {
    skuIds.forEach(skuId => {
      const r = insert.run(communityId, skuId, now(), now());
      if (r.changes > 0) added++;
    });
  });
  tx();
  return success(res, { communityId: parseInt(communityId), added }, '批量添加成功');
});

/* ==========================================================================
   团长申请审核
   ========================================================================== */

/**
 * GET /api/v1/admin/leader-applications
 */
router.get('/leader-applications', (req, res) => {
  const { status } = req.query;
  let sql = `SELECT la.*, c.name as community_name FROM leader_application la LEFT JOIN community c ON c.id = la.community_id WHERE 1=1`;
  const params = [];
  if (status !== undefined && status !== '') {
    sql += ` AND la.status = ?`;
    params.push(parseInt(status));
  }
  sql += ` ORDER BY la.created_at DESC`;
  const list = db.prepare(sql).all(...params);
  return success(res, { list });
});

/**
 * PUT /api/v1/admin/leader-applications/:id/approve
 */
router.put('/leader-applications/:id/approve', (req, res) => {
  const { id } = req.params;
  const { communityId } = req.body;
  const app = db.prepare(`SELECT * FROM leader_application WHERE id = ?`).get(id);
  if (!app) {
    return error(res, '申请记录不存在', 404);
  }
  if (app.status !== 0) {
    return error(res, '该申请已处理', 400);
  }
  const targetCommunityId = communityId || app.community_id;
  const community = db.prepare(`SELECT * FROM community WHERE id = ?`).get(targetCommunityId);
  if (!community) {
    return error(res, '社区不存在', 400);
  }
  const existingLeader = db.prepare(`SELECT id FROM leader WHERE user_id = ? AND community_id = ?`).get(app.user_id, targetCommunityId);
  if (existingLeader) {
    return error(res, '该用户已是该社区的团长', 400);
  }
  const result = db.prepare(`
    INSERT INTO leader (user_id, name, phone, community_id, commission_rate, total_commission, withdrawable_commission, withdrawn_commission, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 8.00, 0, 0, 0, 1, ?, ?)
  `).run(app.user_id, app.name, app.phone, targetCommunityId, now(), now());

  db.prepare(`UPDATE community SET leader_id = ?, updated_at = ? WHERE id = ?`).run(result.lastInsertRowid, now(), targetCommunityId);
  db.prepare(`UPDATE leader_application SET status = 1, updated_at = ? WHERE id = ?`).run(now(), id);

  try {
    createMessage(app.user_id, 'leader_approved', '团长申请已通过', `恭喜您成为「${community.name}」的团长`, null);
  } catch (e) {}

  return success(res, { id: parseInt(id), leaderId: result.lastInsertRowid }, '已通过审核');
});

/**
 * PUT /api/v1/admin/leader-applications/:id/reject
 */
router.put('/leader-applications/:id/reject', (req, res) => {
  const { id } = req.params;
  const { rejectReason } = req.body;
  const app = db.prepare(`SELECT * FROM leader_application WHERE id = ?`).get(id);
  if (!app) {
    return error(res, '申请记录不存在', 404);
  }
  if (app.status !== 0) {
    return error(res, '该申请已处理', 400);
  }
  db.prepare(`UPDATE leader_application SET status = 2, reject_reason = ?, updated_at = ? WHERE id = ?`).run(rejectReason || '', now(), id);

  try {
    createMessage(app.user_id, 'leader_rejected', '团长申请未通过', rejectReason || '您的团长申请未通过审核', null);
  } catch (e) {}

  return success(res, { id: parseInt(id) }, '已驳回申请');
});

/* ==========================================================================
   资金对账
   ========================================================================== */

/**
 * GET /api/v1/admin/finance/records
 */
router.get('/finance/records', (req, res) => {
  const { type, page = 1, pageSize = 20 } = req.query;
  const offset = (page - 1) * pageSize;
  const scope = req.adminScope;

  // 站点管理员: 通过 order_id JOIN \`order\` 过滤 community_id
  let scopeWhere = '';
  const scopeParams = [];
  if (scope && scope.dataScope === 'site') {
    if (!scope.scopeId) return success(res, { list: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize) });
    scopeWhere = ` AND o.community_id = ?`;
    scopeParams.push(scope.scopeId);
  }

  let sql = `SELECT fr.*, o.order_no FROM finance_record fr LEFT JOIN \`order\` o ON o.id = fr.order_id WHERE 1=1${scopeWhere}`;
  const params = [...scopeParams];
  if (type) {
    sql += ` AND fr.type = ?`;
    params.push(type);
  }
  const countSql = `SELECT COUNT(*) as total FROM finance_record fr LEFT JOIN \`order\` o ON o.id = fr.order_id WHERE 1=1${scopeWhere}${type ? ' AND fr.type = ?' : ''}`;
  const countParams = [...scopeParams];
  if (type) countParams.push(type);
  const { total } = db.prepare(countSql).get(...countParams);
  sql += ` ORDER BY fr.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  const list = db.prepare(sql).all(...params);
  return success(res, { list, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

/**
 * GET /api/v1/admin/finance/summary
 */
router.get('/finance/summary', (req, res) => {
  const { dateRange = 'today' } = req.query;
  const scope = req.adminScope;

  let dateCondition = '';
  if (dateRange === 'today') dateCondition = `DATE(fr.created_at) = DATE('now')`;
  else if (dateRange === 'yesterday') dateCondition = `DATE(fr.created_at) = DATE('now', '-1 day')`;
  else if (dateRange === 'last7days') dateCondition = `fr.created_at >= datetime('now', '-7 days')`;

  // 站点管理员: 通过 JOIN \`order\` 过滤本社区
  let scopeJoin = '';
  let scopeWhere = '';
  const scopeParams = [];
  if (scope && scope.dataScope === 'site') {
    if (!scope.scopeId) {
      return success(res, { totalIncome: '0.00', totalOutcome: '0.00', netIncome: '0.00', totalRecords: 0, byType: [] });
    }
    scopeJoin = ` LEFT JOIN \`order\` o ON o.id = fr.order_id`;
    scopeWhere = ` AND o.community_id = ?`;
    scopeParams.push(scope.scopeId);
  }

  const summary = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN fr.direction = 'in' THEN fr.amount ELSE 0 END), 0) as total_income,
      COALESCE(SUM(CASE WHEN fr.direction = 'out' THEN fr.amount ELSE 0 END), 0) as total_outcome,
      COUNT(*) as total_records
    FROM finance_record fr
    ${scopeJoin}
    WHERE 1=1${scopeWhere}${dateCondition ? ' AND ' + dateCondition : ''}
  `).get(...scopeParams);

  const byType = db.prepare(`
    SELECT fr.type,
      COALESCE(SUM(CASE WHEN fr.direction = 'in' THEN fr.amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN fr.direction = 'out' THEN fr.amount ELSE 0 END), 0) as outcome
    FROM finance_record fr
    ${scopeJoin}
    WHERE 1=1${scopeWhere}${dateCondition ? ' AND ' + dateCondition : ''}
    GROUP BY fr.type
  `).all(...scopeParams);

  return success(res, {
    totalIncome: parseFloat(summary.total_income).toFixed(2),
    totalOutcome: parseFloat(summary.total_outcome).toFixed(2),
    netIncome: parseFloat(summary.total_income - summary.total_outcome).toFixed(2),
    totalRecords: summary.total_records,
    byType
  });
});

/**
 * POST /api/v1/admin/finance/reconcile
 * 手动对账: 比对支付流水与订单总额 (仅超级管理员可用)
 */
router.post('/finance/reconcile', (req, res) => {
  const scope = req.adminScope;
  if (scope && scope.dataScope === 'site') {
    return error(res, '站点管理员无权执行全平台对账', 403);
  }

  const orderTotals = db.prepare(`
    SELECT COALESCE(SUM(pay_amount), 0) as total_paid, COUNT(*) as order_count
    FROM \`order\` WHERE pay_status = 1
  `).get();

  const paymentTotals = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_payment, COUNT(*) as payment_count
    FROM payment_transaction WHERE status = 1
  `).get();

  const diff = orderTotals.total_paid - paymentTotals.total_payment;
  return success(res, {
    orderPaidAmount: parseFloat(orderTotals.total_paid).toFixed(2),
    orderCount: orderTotals.order_count,
    paymentAmount: parseFloat(paymentTotals.total_payment).toFixed(2),
    paymentCount: paymentTotals.payment_count,
    diff: parseFloat(diff).toFixed(2),
    isMatched: Math.abs(diff) < 0.01
  });
});

/* ==========================================================================
   用户数据看板
   ========================================================================== */

/**
 * GET /api/v1/admin/reports/users
 */
router.get('/reports/users', (req, res) => {
  const scope = req.adminScope;

  // 站点管理员: "本社区用户" = 在本社区下过单的 DISTINCT user_id (user 表无 community_id)
  let userFilterSql = `FROM user u`;
  let userFilterWhere = '';
  const userFilterParams = [];
  let orderJoinForRevenue = '';
  let orderScopeWhere = '';
  const orderScopeParams = [];
  if (scope && scope.dataScope === 'site') {
    if (!scope.scopeId) {
      return success(res, { newUsersTrend: [], retention: { day1: 0, day7: 0, day30: 0 }, sourceDistribution: [], totalUsers: 0, ltv: 0, totalRevenue: '0.00' });
    }
    userFilterSql = `FROM user u INNER JOIN \`order\` o ON o.user_id = u.id`;
    userFilterWhere = ` AND o.community_id = ?`;
    userFilterParams.push(scope.scopeId);
    orderJoinForRevenue = ` INNER JOIN \`order\` o ON o.user_id = u.id`;
    orderScopeWhere = ` AND o.community_id = ?`;
    orderScopeParams.push(scope.scopeId);
  }

  // 7天新增用户趋势 (按 DISTINCT u.id 计数, 避免站点管理员因多次下单重复计)
  const newUsersTrend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().substring(0, 10);
    const r = db.prepare(`SELECT COUNT(DISTINCT u.id) as cnt ${userFilterSql} WHERE DATE(u.created_at) = ?${userFilterWhere}`).get(d, ...userFilterParams);
    newUsersTrend.push({ date: d.substring(5), count: r.cnt });
  }

  // 用户来源分布
  const sourceDistribution = db.prepare(`
    SELECT u.source, COUNT(DISTINCT u.id) as count
    ${userFilterSql}
    WHERE 1=1${userFilterWhere}
    GROUP BY u.source ORDER BY count DESC
  `).all(...userFilterParams);

  // 留存率 (1d/7d/30d)
  const retention = {};
  [1, 7, 30].forEach(days => {
    const date = new Date(Date.now() - days * 86400000).toISOString().substring(0, 10);
    const baseUsers = db.prepare(`SELECT DISTINCT u.id ${userFilterSql} WHERE DATE(u.created_at) <= ?${userFilterWhere}`).all(date, ...userFilterParams);
    if (!baseUsers.length) {
      retention[`d${days}`] = 0;
      return;
    }
    const ids = baseUsers.map(u => u.id);
    const placeholders = ids.map(() => '?').join(',');
    let activeSql = `SELECT COUNT(DISTINCT user_id) as cnt FROM \`order\` WHERE user_id IN (${placeholders}) AND DATE(created_at) >= ?`;
    const activeParams = [...ids, date];
    if (scope && scope.dataScope === 'site') {
      activeSql += ` AND community_id = ?`;
      activeParams.push(scope.scopeId);
    }
    const activeUsers = db.prepare(activeSql).get(...activeParams);
    retention[`d${days}`] = parseFloat((activeUsers.cnt / baseUsers.length * 100).toFixed(2));
  });

  // LTV 计算 (人均生命周期价值, 站点管理员按本社区订单总收入/本社区用户数)
  const totalUsersRow = db.prepare(`SELECT COUNT(DISTINCT u.id) as cnt ${userFilterSql} WHERE 1=1${userFilterWhere}`).get(...userFilterParams);
  const totalUsers = totalUsersRow.cnt;
  const ltvRow = db.prepare(`
    SELECT COALESCE(SUM(o.pay_amount), 0) as total_revenue
    FROM user u ${orderJoinForRevenue}
    WHERE o.pay_status = 1${orderScopeWhere}
  `).get(...orderScopeParams);
  const ltvValue = totalUsers ? parseFloat((ltvRow.total_revenue / totalUsers).toFixed(2)) : 0;

  return success(res, {
    newUsersTrend,
    retention: {
      day1: retention.d1,
      day7: retention.d7,
      day30: retention.d30
    },
    sourceDistribution,
    totalUsers,
    ltv: ltvValue,
    totalRevenue: parseFloat(ltvRow.total_revenue).toFixed(2)
  });
});

/* ==========================================================================
   操作日志
   ========================================================================== */

/**
 * GET /api/v1/admin/logs
 */
router.get('/logs', (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  const offset = (page - 1) * pageSize;
  const { total } = db.prepare(`SELECT COUNT(*) as total FROM admin_log`).get();
  const list = db.prepare(`
    SELECT l.*, a.username as admin_username, a.real_name as admin_real_name
    FROM admin_log l
    LEFT JOIN admin_user a ON a.id = l.admin_id
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?
  `).all(parseInt(pageSize), offset);
  return success(res, { list, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

/* ==========================================================================
   商品批量导入/导出
   ========================================================================== */

/**
 * GET /api/v1/admin/products/export
 * 导出全部商品为 JSON 数组 (前端转 Excel)
 */
router.get('/products/export', (req, res) => {
  const list = db.prepare(`
    SELECT s.id, s.name, s.subtitle, s.category_id, s.unit, s.cost_price, s.market_price,
           s.sale_price, s.commission_rate, s.origin, s.storage_type, s.main_image, s.sales_count, s.status,
           c.name as category_name
    FROM sku s LEFT JOIN category c ON c.id = s.category_id
    ORDER BY s.id ASC
  `).all();
  return success(res, { list, total: list.length });
});

/**
 * POST /api/v1/admin/products/import
 * 批量导入商品
 */
router.post('/products/import', (req, res) => {
  const { products } = req.body;
  if (!Array.isArray(products) || !products.length) {
    return error(res, 'products 不能为空', 400);
  }
  const insert = db.prepare(`
    INSERT INTO sku (spu_id, category_id, name, subtitle, main_image, origin, storage_type, unit, cost_price, market_price, sale_price, commission_rate, sales_count, status)
    VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
  `);
  let successCount = 0;
  const failed = [];
  const tx = db.transaction(() => {
    products.forEach((p, idx) => {
      if (!p.name || !p.categoryId || !p.salePrice) {
        failed.push({ index: idx, reason: '缺少必填字段 (name/categoryId/salePrice)' });
        return;
      }
      try {
        insert.run(
          p.categoryId, p.name, p.subtitle || '', p.mainImage || '',
          p.origin || '', p.storageType || '', p.unit || '份',
          p.costPrice || 0, p.marketPrice || 0, p.salePrice,
          p.commissionRate || 8.00
        );
        successCount++;
      } catch (e) {
        failed.push({ index: idx, reason: e.message });
      }
    });
  });
  tx();
  return success(res, { successCount, failedCount: failed.length, failed }, '导入完成');
});

/* ==========================================================================
   骑手绩效
   ========================================================================== */

/**
 * GET /api/v1/admin/riders/:id/performance
 */
router.get('/riders/:id/performance', (req, res) => {
  const { id } = req.params;
  const rider = db.prepare(`SELECT * FROM rider WHERE id = ?`).get(id);
  if (!rider) {
    return error(res, '骑手不存在', 404);
  }
  const deliveryStats = db.prepare(`
    SELECT
      COUNT(*) as total_orders,
      SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) as completed_orders,
      SUM(CASE WHEN status = 4 THEN 1 ELSE 0 END) as cancelled_orders,
      AVG(CASE WHEN status = 3 AND pick_time IS NOT NULL AND deliver_time IS NOT NULL
        THEN (julianday(deliver_time) - julianday(pick_time)) * 24 * 60 END) as avg_delivery_minutes
    FROM rider_delivery WHERE rider_id = ?
  `).get(id);
  const ratingStats = db.prepare(`
    SELECT
      COUNT(*) as rating_count,
      AVG(rating) as avg_rating,
      SUM(CASE WHEN is_complaint = 1 THEN 1 ELSE 0 END) as complaint_count
    FROM rider_rating WHERE rider_id = ?
  `).get(id);
  return success(res, {
    rider: {
      id: rider.id,
      name: rider.name,
      phone: rider.phone,
      status: rider.status,
      createdAt: rider.created_at
    },
    stats: {
      totalOrders: deliveryStats.total_orders || 0,
      completedOrders: deliveryStats.completed_orders || 0,
      cancelledOrders: deliveryStats.cancelled_orders || 0,
      avgDeliveryMinutes: deliveryStats.avg_delivery_minutes ? parseFloat(deliveryStats.avg_delivery_minutes).toFixed(1) : 0,
      ratingCount: ratingStats.rating_count || 0,
      avgRating: ratingStats.avg_rating ? parseFloat(ratingStats.avg_rating).toFixed(2) : 0,
      complaintCount: ratingStats.complaint_count || 0
    }
  });
});

/* ==========================================================================
   订单调度
   ========================================================================== */

/**
 * GET /api/v1/admin/orders/dispatch
 * 待调度订单 (status=20 已支付待分配骑手)
 */
router.get('/orders/dispatch', (req, res) => {
  const scope = req.adminScope;
  let scopeWhere = '';
  const scopeParams = [];
  if (scope && scope.dataScope === 'site') {
    if (!scope.scopeId) return success(res, { list: [], total: 0 });
    scopeWhere = ` AND o.community_id = ?`;
    scopeParams.push(scope.scopeId);
  }
  const list = db.prepare(`
    SELECT o.*, u.nick_name, u.phone, c.name as community_name, w.name as warehouse_name
    FROM \`order\` o
    LEFT JOIN user u ON u.id = o.user_id
    LEFT JOIN community c ON c.id = o.community_id
    LEFT JOIN warehouse w ON w.id = o.warehouse_id
    WHERE o.status = 20${scopeWhere}
    ORDER BY o.created_at ASC
  `).all(...scopeParams);
  const itemStmt = db.prepare(`SELECT * FROM order_item WHERE order_id = ?`);
  list.forEach(o => { o.items = itemStmt.all(o.id); });
  return success(res, { list, total: list.length });
});

/**
 * POST /api/v1/admin/orders/:id/assign-rider
 * 管理员手动分配骑手
 */
router.post('/orders/:id/assign-rider', (req, res) => {
  const { id } = req.params;
  const { riderId } = req.body;
  if (!riderId) {
    return error(res, 'riderId 不能为空', 400);
  }
  const order = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(id);
  if (!order) {
    return error(res, '订单不存在', 404);
  }
  const rider = db.prepare(`SELECT * FROM rider WHERE id = ?`).get(riderId);
  if (!rider) {
    return error(res, '骑手不存在', 404);
  }

  const nowStr = now();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE \`order\` SET status = 30, rider_id = ?, rider_accept_time = ?, updated_at = ? WHERE id = ?`)
      .run(riderId, nowStr, nowStr, id);
    db.prepare(`
      INSERT INTO rider_delivery (order_id, rider_id, status, accept_time, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?, ?)
    `).run(id, riderId, nowStr, nowStr, nowStr);
    db.prepare(`UPDATE rider SET current_orders = current_orders + 1, updated_at = ? WHERE id = ?`).run(nowStr, riderId);
    db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark, created_at) VALUES (?, ?, 30, 'admin', '管理员分配骑手', ?)`)
      .run(id, order.status, nowStr);
  });
  try { tx(); } catch (e) { return error(res, '分配失败: ' + e.message, 500); }

  return success(res, { id: parseInt(id), riderId: parseInt(riderId) }, '骑手已分配');
});

/**
 * POST /api/v1/admin/orders/:id/cancel
 * 管理员取消订单
 */
router.post('/orders/:id/cancel', (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const order = db.prepare(`SELECT * FROM \`order\` WHERE id = ?`).get(id);
  if (!order) {
    return error(res, '订单不存在', 404);
  }
  if (order.status === 99 || order.status === 50) {
    return error(res, '订单已取消或已完成', 400);
  }
  const nowStr = now();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE \`order\` SET status = 99, cancel_time = ?, cancel_reason = ?, updated_at = ? WHERE id = ?`)
      .run(nowStr, reason || '管理员取消', nowStr, id);
    db.prepare(`INSERT INTO order_status_log (order_id, from_status, to_status, operator, remark, created_at) VALUES (?, ?, 99, 'admin', ?, ?)`)
      .run(id, order.status, reason || '管理员取消', nowStr);
  });
  try { tx(); } catch (e) { return error(res, '取消失败: ' + e.message, 500); }

  try {
    createMessage(order.user_id, 'order_cancelled', '订单已取消', `订单 ${order.order_no} 已被取消，原因：${reason || '管理员取消'}`, id);
  } catch (e) {}

  return success(res, { id: parseInt(id), status: 99 }, '订单已取消');
});

/* ==========================================================================
   前台用户管理 (C端注册用户)
   ========================================================================== */

/**
 * GET /api/v1/admin/users
 * 前台用户列表 (分页/搜索/筛选, 站点管理员只看本社区下单用户)
 */
router.get('/users', (req, res) => {
  const { page = 1, pageSize = 20, keyword, status, memberLevel, source } = req.query;
  const offset = (page - 1) * pageSize;
  const scope = req.adminScope;

  // 站点管理员: user 表无 community_id, 通过 order 反查本社区下单用户
  let scopeJoin = '';
  let scopeWhere = '';
  const scopeParams = [];
  if (scope && scope.dataScope === 'site') {
    if (!scope.scopeId) return success(res, { list: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize) });
    scopeJoin = ` INNER JOIN (SELECT DISTINCT user_id, community_id FROM \`order\`) ox ON ox.user_id = u.id`;
    scopeWhere = ` AND ox.community_id = ?`;
    scopeParams.push(scope.scopeId);
  }

  let sql = `SELECT DISTINCT u.id, u.phone, u.nick_name, u.avatar_url, u.member_level, u.total_consume, u.order_count, u.points, u.source, u.status, u.last_login_at, u.created_at FROM user u ${scopeJoin} WHERE 1=1${scopeWhere}`;
  const params = [...scopeParams];

  if (keyword) {
    sql += ` AND (u.phone LIKE ? OR u.nick_name LIKE ?)`;
    params.push('%' + keyword + '%', '%' + keyword + '%');
  }
  if (status !== undefined && status !== '') {
    sql += ` AND u.status = ?`;
    params.push(parseInt(status));
  }
  if (memberLevel) {
    sql += ` AND u.member_level = ?`;
    params.push(parseInt(memberLevel));
  }
  if (source) {
    sql += ` AND u.source = ?`;
    params.push(source);
  }

  // 计数 (DISTINCT u.id)
  let countSql = `SELECT COUNT(DISTINCT u.id) as total FROM user u ${scopeJoin} WHERE 1=1${scopeWhere}`;
  const countParams = [...scopeParams];
  if (keyword) { countSql += ` AND (u.phone LIKE ? OR u.nick_name LIKE ?)`; countParams.push('%' + keyword + '%', '%' + keyword + '%'); }
  if (status !== undefined && status !== '') { countSql += ` AND u.status = ?`; countParams.push(parseInt(status)); }
  if (memberLevel) { countSql += ` AND u.member_level = ?`; countParams.push(parseInt(memberLevel)); }
  if (source) { countSql += ` AND u.source = ?`; countParams.push(source); }
  const totalRow = db.prepare(countSql).get(...countParams);

  sql += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const list = db.prepare(sql).all(...params);
  return success(res, { list, total: totalRow.total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

/**
 * GET /api/v1/admin/users/:id
 * 前台用户详情 (基本信息 + 订单列表 + 收货地址)
 */
router.get('/users/:id', (req, res) => {
  const { id } = req.params;
  const scope = req.adminScope;

  const user = db.prepare(`SELECT id, phone, nick_name, avatar_url, email, member_level, total_consume, order_count, points, source, status, last_login_at, created_at FROM user WHERE id = ?`).get(id);
  if (!user) return error(res, '用户不存在', 404);

  // 站点管理员: 校验该用户是否在自己社区下过单
  if (scope && scope.dataScope === 'site') {
    if (!scope.scopeId) return error(res, '无权查看', 403);
    const inScope = db.prepare(`SELECT 1 FROM \`order\` WHERE user_id = ? AND community_id = ? LIMIT 1`).get(id, scope.scopeId);
    if (!inScope) return error(res, '无权查看该用户 (非本社区用户)', 403);
  }

  // 订单列表 (站点管理员只看本社区订单)
  let orderWhere = '';
  const orderParams = [id];
  if (scope && scope.dataScope === 'site') { orderWhere = ` AND community_id = ?`; orderParams.push(scope.scopeId); }
  const orders = db.prepare(`SELECT id, order_no, status, pay_amount, pay_status, created_at FROM \`order\` WHERE user_id = ?${orderWhere} ORDER BY created_at DESC LIMIT 50`).all(...orderParams);

  // 收货地址
  const addresses = db.prepare(`SELECT * FROM user_address WHERE user_id = ? ORDER BY is_default DESC, id DESC`).all(id);

  return success(res, { user, orders, addresses });
});

/**
 * PUT /api/v1/admin/users/:id
 * 编辑前台用户 (昵称/邮箱/会员等级/积分)
 */
router.put('/users/:id', (req, res) => {
  const { id } = req.params;
  const { nickName, email, memberLevel, points } = req.body;
  const scope = req.adminScope;

  const existing = db.prepare(`SELECT id FROM user WHERE id = ?`).get(id);
  if (!existing) return error(res, '用户不存在', 404);

  if (scope && scope.dataScope === 'site') {
    if (!scope.scopeId) return error(res, '无权操作', 403);
    const inScope = db.prepare(`SELECT 1 FROM \`order\` WHERE user_id = ? AND community_id = ? LIMIT 1`).get(id, scope.scopeId);
    if (!inScope) return error(res, '无权操作该用户 (非本社区用户)', 403);
  }

  const updates = [];
  const params = [];
  if (nickName !== undefined) { updates.push('nick_name = ?'); params.push(nickName); }
  if (email !== undefined) { updates.push('email = ?'); params.push(email); }
  if (memberLevel !== undefined) { updates.push('member_level = ?'); params.push(parseInt(memberLevel)); }
  if (points !== undefined) { updates.push('points = ?'); params.push(parseInt(points)); }
  if (!updates.length) return error(res, '没有需要更新的字段', 400);

  updates.push('updated_at = ?');
  params.push(now(), id);
  db.prepare(`UPDATE user SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return success(res, { id: parseInt(id) }, '用户信息已更新');
});

/**
 * PUT /api/v1/admin/users/:id/status
 * 启用/禁用前台用户 (status: 1=启用, 0=禁用)
 */
router.put('/users/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const scope = req.adminScope;

  if (status !== 0 && status !== 1) return error(res, 'status 取值非法', 400);

  const existing = db.prepare(`SELECT id FROM user WHERE id = ?`).get(id);
  if (!existing) return error(res, '用户不存在', 404);

  if (scope && scope.dataScope === 'site') {
    if (!scope.scopeId) return error(res, '无权操作', 403);
    const inScope = db.prepare(`SELECT 1 FROM \`order\` WHERE user_id = ? AND community_id = ? LIMIT 1`).get(id, scope.scopeId);
    if (!inScope) return error(res, '无权操作该用户 (非本社区用户)', 403);
  }

  db.prepare(`UPDATE user SET status = ?, updated_at = ? WHERE id = ?`).run(status, now(), id);
  return success(res, { id: parseInt(id), status }, '用户状态已更新');
});

/**
 * POST /api/v1/admin/users/:id/reset-password
 * 重置前台用户密码 (管理员重置为指定新密码)
 */
router.post('/users/:id/reset-password', (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  const scope = req.adminScope;

  if (!newPassword || newPassword.length < 6) {
    return error(res, '新密码长度不能少于6位', 400);
  }

  const existing = db.prepare(`SELECT id FROM user WHERE id = ?`).get(id);
  if (!existing) return error(res, '用户不存在', 404);

  if (scope && scope.dataScope === 'site') {
    if (!scope.scopeId) return error(res, '无权操作', 403);
    const inScope = db.prepare(`SELECT 1 FROM \`order\` WHERE user_id = ? AND community_id = ? LIMIT 1`).get(id, scope.scopeId);
    if (!inScope) return error(res, '无权操作该用户 (非本社区用户)', 403);
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare(`UPDATE user SET password_hash = ?, updated_at = ? WHERE id = ?`).run(hash, now(), id);
  return success(res, { id: parseInt(id) }, '密码已重置');
});

/* ==========================================================================
   管理员角色 & 用户管理 (RBAC) - 仅超级管理员可用
   ========================================================================== */

/**
 * GET /api/v1/admin/roles
 */
router.get('/roles', (req, res) => {
  const scope = req.adminScope;
  if (scope && scope.dataScope === 'site') {
    return error(res, '站点管理员无权管理角色', 403);
  }
  const list = db.prepare(`
    SELECT r.*, (SELECT COUNT(*) FROM admin_user a WHERE a.role_id = r.id) as user_count
    FROM admin_role r ORDER BY r.id ASC
  `).all();
  return success(res, { list });
});

/**
 * POST /api/v1/admin/roles
 */
router.post('/roles', (req, res) => {
  const scope = req.adminScope;
  if (scope && scope.dataScope === 'site') {
    return error(res, '站点管理员无权管理角色', 403);
  }
  const { name, permissions, dataScope: scopeField } = req.body;
  if (!name) {
    return error(res, '角色名称不能为空', 400);
  }
  const permStr = Array.isArray(permissions) ? JSON.stringify(permissions) : (permissions || '[]');
  // 仅允许创建 all 或 site 两类角色
  const dataScopeVal = scopeField === 'site' ? 'site' : 'all';
  const result = db.prepare(`INSERT INTO admin_role (name, permissions, data_scope, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .run(name, permStr, dataScopeVal, now(), now());
  return success(res, { id: result.lastInsertRowid }, '角色创建成功');
});

/**
 * PUT /api/v1/admin/roles/:id
 */
router.put('/roles/:id', (req, res) => {
  const scope = req.adminScope;
  if (scope && scope.dataScope === 'site') {
    return error(res, '站点管理员无权管理角色', 403);
  }
  const { id } = req.params;
  const { name, permissions, dataScope: scopeField } = req.body;
  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (permissions !== undefined) {
    const permStr = Array.isArray(permissions) ? JSON.stringify(permissions) : (permissions || '[]');
    updates.push('permissions = ?'); params.push(permStr);
  }
  if (scopeField !== undefined) {
    updates.push('data_scope = ?'); params.push(scopeField === 'site' ? 'site' : 'all');
  }
  if (!updates.length) {
    return error(res, '没有需要更新的字段', 400);
  }
  updates.push('updated_at = ?');
  params.push(now(), id);
  db.prepare(`UPDATE admin_role SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return success(res, { id: parseInt(id) }, '角色已更新');
});

/**
 * GET /api/v1/admin/admin-users
 */
router.get('/admin-users', (req, res) => {
  const scope = req.adminScope;
  if (scope && scope.dataScope === 'site') {
    return error(res, '站点管理员无权查看管理员列表', 403);
  }
  const list = db.prepare(`
    SELECT a.id, a.username, a.real_name, a.role_id, a.scope_id, a.status, a.created_at,
           r.name as role_name, r.permissions, r.data_scope,
           c.name as scope_community_name
    FROM admin_user a
    LEFT JOIN admin_role r ON r.id = a.role_id
    LEFT JOIN community c ON c.id = a.scope_id
    ORDER BY a.id ASC
  `).all();
  return success(res, { list });
});

/**
 * POST /api/v1/admin/admin-users
 */
router.post('/admin-users', (req, res) => {
  const scope = req.adminScope;
  if (scope && scope.dataScope === 'site') {
    return error(res, '站点管理员无权创建管理员账号', 403);
  }
  const { username, password, realName, roleId, scopeId } = req.body;
  if (!username || !password) {
    return error(res, '用户名和密码不能为空', 400);
  }
  // 校验: 站点管理员角色必须传 scopeId
  const role = roleId ? db.prepare(`SELECT data_scope FROM admin_role WHERE id = ?`).get(roleId) : null;
  if (role && role.data_scope === 'site' && !scopeId) {
    return error(res, '站点管理员角色必须绑定一个社区 (scopeId)', 400);
  }
  const existing = db.prepare(`SELECT id FROM admin_user WHERE username = ?`).get(username);
  if (existing) {
    return error(res, '用户名已存在', 400);
  }
  const hash = bcrypt.hashSync(password, 12);
  const result = db.prepare(`
    INSERT INTO admin_user (username, password, real_name, role_id, scope_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(username, hash, realName || '', roleId || null, (role && role.data_scope === 'site') ? scopeId : null, now(), now());
  return success(res, { id: result.lastInsertRowid }, '管理员账号创建成功');
});

/**
 * PUT /api/v1/admin/admin-users/:id/status
 */
router.put('/admin-users/:id/status', (req, res) => {
  const scope = req.adminScope;
  if (scope && scope.dataScope === 'site') {
    return error(res, '站点管理员无权修改管理员状态', 403);
  }
  const { id } = req.params;
  const { status } = req.body;
  if (status !== 0 && status !== 1) return error(res, 'status 取值非法', 400);
  const existing = db.prepare(`SELECT id FROM admin_user WHERE id = ?`).get(id);
  if (!existing) return error(res, '管理员不存在', 404);
  db.prepare(`UPDATE admin_user SET status = ?, updated_at = ? WHERE id = ?`).run(status, now(), id);
  return success(res, { id: parseInt(id), status }, '状态已更新');
});

/**
 * PUT /api/v1/admin/admin-users/:id
 * 编辑管理员账号 (姓名/角色/绑定社区)
 */
router.put('/admin-users/:id', (req, res) => {
  const scope = req.adminScope;
  if (scope && scope.dataScope === 'site') {
    return error(res, '站点管理员无权编辑管理员账号', 403);
  }
  const { id } = req.params;
  const { realName, roleId, scopeId } = req.body;

  const existing = db.prepare(`SELECT id FROM admin_user WHERE id = ?`).get(id);
  if (!existing) return error(res, '管理员不存在', 404);

  // 校验角色和 scopeId 一致性
  let finalScopeId = null;
  if (roleId) {
    const role = db.prepare(`SELECT data_scope FROM admin_role WHERE id = ?`).get(roleId);
    if (!role) return error(res, '角色不存在', 400);
    if (role.data_scope === 'site') {
      if (!scopeId) return error(res, '站点管理员角色必须绑定一个社区 (scopeId)', 400);
      finalScopeId = scopeId;
    }
  }

  const updates = [];
  const params = [];
  if (realName !== undefined) { updates.push('real_name = ?'); params.push(realName); }
  if (roleId !== undefined) {
    updates.push('role_id = ?'); params.push(roleId || null);
    updates.push('scope_id = ?'); params.push(finalScopeId);
  }
  if (!updates.length) return error(res, '没有需要更新的字段', 400);

  updates.push('updated_at = ?');
  params.push(now(), id);
  db.prepare(`UPDATE admin_user SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return success(res, { id: parseInt(id) }, '管理员账号已更新');
});

/**
 * PUT /api/v1/admin/admin-users/:id/password
 * 修改管理员密码 (超管重置其他管理员的密码)
 */
router.put('/admin-users/:id/password', (req, res) => {
  const scope = req.adminScope;
  if (scope && scope.dataScope === 'site') {
    return error(res, '站点管理员无权修改管理员密码', 403);
  }
  const { id } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return error(res, '新密码长度不能少于6位', 400);
  }
  const existing = db.prepare(`SELECT id FROM admin_user WHERE id = ?`).get(id);
  if (!existing) return error(res, '管理员不存在', 404);

  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare(`UPDATE admin_user SET password = ?, updated_at = ? WHERE id = ?`).run(hash, now(), id);
  return success(res, { id: parseInt(id) }, '密码已修改');
});

/**
 * DELETE /api/v1/admin/admin-users/:id
 * 删除管理员账号 (不能删自己, 不能删除最后一个超级管理员)
 */
router.delete('/admin-users/:id', (req, res) => {
  const scope = req.adminScope;
  if (scope && scope.dataScope === 'site') {
    return error(res, '站点管理员无权删除管理员账号', 403);
  }
  const { id } = req.params;
  const adminId = req.adminId;

  if (parseInt(id) === parseInt(adminId)) {
    return error(res, '不能删除当前登录的管理员账号', 400);
  }

  const target = db.prepare(`SELECT a.id, r.data_scope FROM admin_user a LEFT JOIN admin_role r ON r.id = a.role_id WHERE a.id = ?`).get(id);
  if (!target) return error(res, '管理员不存在', 404);

  // 如果删除的是超级管理员, 检查是否还有其他超级管理员
  if (target.data_scope === 'all') {
    const remainingSuper = db.prepare(`SELECT COUNT(*) as cnt FROM admin_user a LEFT JOIN admin_role r ON r.id = a.role_id WHERE r.data_scope = 'all' AND a.id != ?`).get(id);
    if (remainingSuper.cnt === 0) {
      return error(res, '不能删除最后一个超级管理员', 400);
    }
  }

  db.prepare(`DELETE FROM admin_user WHERE id = ?`).run(id);
  return success(res, { id: parseInt(id) }, '管理员账号已删除');
});

/* ==========================================================================
   库存预警 & 社区列表
   ========================================================================== */

/**
 * GET /api/v1/admin/inventory/warnings
 * 库存预警列表 (available_stock <= warning_threshold)
 */
router.get('/inventory/warnings', (req, res) => {
  const scope = req.adminScope;
  let scopeJoin = '';
  let scopeWhere = '';
  const scopeParams = [];
  if (scope && scope.dataScope === 'site') {
    if (!scope.scopeId) return success(res, { list: [], total: 0 });
    scopeJoin = ` INNER JOIN warehouse_coverage wc ON wc.warehouse_id = i.warehouse_id`;
    scopeWhere = ` AND wc.community_id = ?`;
    scopeParams.push(scope.scopeId);
  }
  const list = db.prepare(`
    SELECT DISTINCT i.id, i.available_stock, i.locked_stock, i.warning_threshold, i.updated_at,
           s.id as sku_id, s.name as sku_name, s.main_image, s.unit, s.sale_price, s.status as sku_status,
           w.id as warehouse_id, w.name as warehouse_name,
           c.name as category_name
    FROM inventory i
    ${scopeJoin}
    INNER JOIN sku s ON s.id = i.sku_id
    INNER JOIN warehouse w ON w.id = i.warehouse_id
    LEFT JOIN category c ON c.id = s.category_id
    WHERE i.available_stock <= i.warning_threshold${scopeWhere}
    ORDER BY i.available_stock ASC, i.updated_at DESC
  `).all(...scopeParams);
  const result = list.map(i => ({
    id: i.id,
    skuId: i.sku_id,
    skuName: i.sku_name,
    mainImage: i.main_image,
    unit: i.unit,
    salePrice: i.sale_price,
    skuStatus: i.sku_status,
    categoryName: i.category_name,
    warehouseId: i.warehouse_id,
    warehouseName: i.warehouse_name,
    availableStock: i.available_stock,
    lockedStock: i.locked_stock,
    warningThreshold: i.warning_threshold,
    shortage: Math.max(0, i.warning_threshold - i.available_stock),
    updatedAt: i.updated_at
  }));
  return success(res, { list: result, total: result.length });
});

/**
 * GET /api/v1/admin/communities
 * 社区列表 (含城市名, 用于下拉选择)
 */
router.get('/communities', (req, res) => {
  const list = db.prepare(`
    SELECT c.id, c.city_id, c.name, c.address, c.latitude, c.longitude,
           c.household_count, c.leader_id, c.status, c.created_at,
           ci.name as city_name,
           l.name as leader_name
    FROM community c
    LEFT JOIN city ci ON ci.id = c.city_id
    LEFT JOIN leader l ON l.id = c.leader_id
    ORDER BY c.id ASC
  `).all();
  return success(res, { list });
});

module.exports = router;

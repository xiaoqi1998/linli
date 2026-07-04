const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error } = require('../helpers');
const authMiddleware = require('../middleware/auth');

// 所有后台接口需要登录 (Demo: 复用用户Token, 正式环境应区分角色)
router.use(authMiddleware);

/* ==========================================================================
   商品管理
   ========================================================================== */

/**
 * GET /api/v1/admin/products
 */
router.get('/products', (req, res) => {
  const { page = 1, pageSize = 20, status, categoryId, keyword } = req.query;
  const offset = (page - 1) * pageSize;

  let sql = `SELECT s.*, c.name as category_name FROM sku s LEFT JOIN category c ON c.id = s.category_id WHERE 1=1`;
  const params = [];

  if (status) { sql += ` AND s.status = ?`; params.push(parseInt(status)); }
  if (categoryId) { sql += ` AND s.category_id = ?`; params.push(parseInt(categoryId)); }
  if (keyword) { sql += ` AND s.name LIKE ?`; params.push('%' + keyword + '%'); }

  sql += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const list = db.prepare(sql).all(...params);
  const totalRow = db.prepare(`SELECT COUNT(*) as total FROM sku s WHERE 1=1${status ? ' AND s.status = ?' : ''}${categoryId ? ' AND s.category_id = ?' : ''}${keyword ? ' AND s.name LIKE ?' : ''}`).get(...params.slice(0, -2));

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

  let sql = `SELECT o.*, u.nick_name, u.phone, c.name as community_name FROM \`order\` o LEFT JOIN user u ON u.id = o.user_id LEFT JOIN community c ON c.id = o.community_id WHERE 1=1`;
  const params = [];

  if (status) { sql += ` AND o.status = ?`; params.push(parseInt(status)); }
  if (communityId) { sql += ` AND o.community_id = ?`; params.push(parseInt(communityId)); }
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
    WHERE o.pay_status = 1 ${dateCondition ? 'AND ' + dateCondition : ''}
  `).get();

  const newUsers = db.prepare(`SELECT COUNT(*) as cnt FROM user WHERE DATE(created_at) = ?`).get(today);

  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().substring(0, 10);
    const r = db.prepare(`SELECT COUNT(*) as orders, COALESCE(SUM(pay_amount), 0) as gmv FROM \`order\` WHERE DATE(created_at) = ? AND pay_status = 1`).get(d);
    trend.push({ date: d.substring(5), orders: r.orders, gmv: parseFloat(r.gmv).toFixed(2) });
  }

  const categorySales = db.prepare(`
    SELECT c.name, c.icon, COUNT(oi.id) as cnt, COALESCE(SUM(oi.price * oi.quantity), 0) as amount
    FROM order_item oi
    JOIN sku s ON s.id = oi.sku_id
    JOIN category c ON c.id = s.category_id
    JOIN \`order\` o ON o.id = oi.order_id
    WHERE o.pay_status = 1 ${dateCondition ? 'AND ' + dateCondition : ''}
    GROUP BY c.id ORDER BY amount DESC LIMIT 8
  `).all();

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

  let sql = `SELECT l.*, u.nick_name, u.phone, c.name as community_name, (SELECT COUNT(*) FROM \`order\` o WHERE o.leader_id = l.id) as order_count FROM leader l LEFT JOIN user u ON u.id = l.user_id LEFT JOIN community c ON c.id = l.community_id WHERE 1=1`;
  const params = [];
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

  let sql = `
    SELECT r.*, w.name as warehouse_name
    FROM rider r
    LEFT JOIN warehouse w ON w.id = r.warehouse_id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    sql += ' AND r.status = ?';
    params.push(parseInt(status));
  }

  const { total } = db.prepare(`SELECT COUNT(*) as total FROM rider r WHERE 1=1${status ? ' AND r.status = ?' : ''}`).get(...(status ? [parseInt(status)] : []));

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
  const { name, phone, warehouseId } = req.body;

  if (!name || !warehouseId) {
    return error(res, '姓名和前置仓不能为空', 400);
  }

  const result = db.prepare(`
    INSERT INTO rider (name, phone, warehouse_id, status, current_orders, created_at, updated_at)
    VALUES (?, ?, ?, 1, 0, datetime('now'), datetime('now'))
  `).run(name, phone || '', warehouseId);

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

  let sql = `
    SELECT i.id, i.available_stock, i.locked_stock, i.warning_threshold, i.updated_at,
           s.name as sku_name, s.main_image, s.unit, s.sale_price, s.status as sku_status,
           w.name as warehouse_name,
           c.name as category_name
    FROM inventory i
    INNER JOIN sku s ON s.id = i.sku_id
    INNER JOIN warehouse w ON w.id = i.warehouse_id
    LEFT JOIN category c ON c.id = s.category_id
    WHERE 1=1
  `;
  const params = [];

  if (warehouseId) {
    sql += ' AND i.warehouse_id = ?';
    params.push(parseInt(warehouseId));
  }

  const countSql = `SELECT COUNT(*) as total FROM inventory i WHERE 1=1${warehouseId ? ' AND i.warehouse_id = ?' : ''}`;
  const { total } = db.prepare(countSql).get(...(warehouseId ? [parseInt(warehouseId)] : []));

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

module.exports = router;

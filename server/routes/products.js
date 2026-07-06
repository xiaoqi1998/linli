const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error } = require('../helpers');

/**
 * GET /api/v1/products/communities
 * 社区列表 (用于社区定位/切换)
 */
router.get('/communities', (req, res) => {
  const list = db.prepare(`
    SELECT c.id, c.name, c.address, c.latitude, c.longitude,
           w.id as warehouse_id
    FROM community c
    LEFT JOIN warehouse_coverage wc ON wc.community_id = c.id
    LEFT JOIN warehouse w ON w.id = wc.warehouse_id
    WHERE c.status = 1
    ORDER BY c.id
  `).all();

  return success(res, {
    list: list.map(c => ({
      id: c.id,
      name: c.name,
      address: c.address,
      latitude: c.latitude,
      longitude: c.longitude,
      warehouseId: c.warehouse_id,
      deliveryRadius: 1500,
    })),
  });
});

/**
 * GET /api/v1/products/locate-community
 * 根据经纬度定位最近社区 (Geolocation)
 * Query: lat, lng
 */
router.get('/locate-community', (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  if (isNaN(lat) || isNaN(lng)) {
    return error(res, '经纬度参数无效', 400);
  }

  const communities = db.prepare(`
    SELECT c.id, c.name, c.address, c.latitude, c.longitude,
           w.id as warehouse_id
    FROM community c
    LEFT JOIN warehouse_coverage wc ON wc.community_id = c.id
    LEFT JOIN warehouse w ON w.id = wc.warehouse_id
    WHERE c.status = 1 AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
  `).all();

  if (communities.length === 0) {
    return success(res, { community: null, inRange: false, distance: null }, '暂无社区数据');
  }

  // 计算最近社区 (Haversine 公式)
  let nearest = null;
  let minDist = Infinity;
  for (const c of communities) {
    const dist = haversine(lat, lng, c.latitude, c.longitude);
    if (dist < minDist) {
      minDist = dist;
      nearest = c;
    }
  }

  const radius = 1500;
  const inRange = minDist <= radius;

  return success(res, {
    community: {
      id: nearest.id,
      name: nearest.name,
      address: nearest.address,
      latitude: nearest.latitude,
      longitude: nearest.longitude,
      warehouseId: nearest.warehouse_id,
      deliveryRadius: radius,
    },
    distance: Math.round(minDist),
    inRange,
  }, inRange ? '已定位到最近社区' : '您附近暂未开通服务');
});

/**
 * Haversine 公式计算两点距离 (米)
 */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000; // 地球半径(米)
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * GET /api/v1/products/nearby-warehouses
 * 根据经纬度查询附近网点(前置仓), 按1000公里划分分组
 * Query: lat, lng
 * 返回: { groups: [{ label, range, warehouses: [...] }], total }
 */
router.get('/nearby-warehouses', (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  if (isNaN(lat) || isNaN(lng)) {
    return error(res, '经纬度参数无效', 400);
  }

  const warehouses = db.prepare(`
    SELECT w.id, w.name, w.address, w.latitude, w.longitude, w.radius, w.status,
           c.name as city_name
    FROM warehouse w
    INNER JOIN city c ON c.id = w.city_id
    WHERE w.status = 1 AND w.latitude IS NOT NULL AND w.longitude IS NOT NULL
    ORDER BY w.id
  `).all();

  if (warehouses.length === 0) {
    return success(res, { groups: [], total: 0 }, '暂无网点数据');
  }

  // 计算每个网点距离并按1000公里(1000000米)划分分组
  const TIER_KM = 1000; // 每组1000公里
  const TIER_M = TIER_KM * 1000;
  const tiers = {}; // tierIndex -> warehouses[]

  for (const w of warehouses) {
    const distM = haversine(lat, lng, w.latitude, w.longitude);
    const distKm = distM / 1000;
    const tierIndex = Math.floor(distKm / TIER_KM);
    if (!tiers[tierIndex]) tiers[tierIndex] = [];
    tiers[tierIndex].push({
      id: w.id,
      name: w.name,
      cityName: w.city_name,
      address: w.address,
      latitude: w.latitude,
      longitude: w.longitude,
      radius: w.radius,
      distanceKm: Math.round(distKm * 10) / 10, // 保留1位小数
    });
  }

  // 构建分组 (按距离从近到远排序)
  const groups = Object.keys(tiers).map(Number).sort((a, b) => a - b).map(tierIndex => {
    const ws = tiers[tierIndex].sort((a, b) => a.distanceKm - b.distanceKm);
    const minKm = tierIndex * TIER_KM;
    const maxKm = (tierIndex + 1) * TIER_KM;
    const label = tierIndex === 0
      ? `${TIER_KM}公里内`
      : `${minKm}-${maxKm}公里`;
    return {
      label,
      range: [minKm, maxKm],
      tierIndex,
      count: ws.length,
      warehouses: ws,
    };
  });

  return success(res, {
    groups,
    total: warehouses.length,
    location: { latitude: lat, longitude: lng },
  }, `已找到${warehouses.length}个网点, 按${TIER_KM}公里划分为${groups.length}组`);
});

/**
 * GET /api/v1/products
 * 商品列表 (分页, 按社区和分类筛选)
 * Query: page, pageSize, communityId, categoryId, sort
 */
router.get('/', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const communityId = parseInt(req.query.communityId) || 1;
  const categoryId = parseInt(req.query.categoryId) || 0;
  const sort = req.query.sort || 'sales'; // sales | price_asc | price_desc
  const offset = (page - 1) * pageSize;

  let sql = `
    SELECT s.id, s.name, s.subtitle, s.main_image, s.unit,
           s.market_price, s.sale_price, s.sales_count, s.origin,
           s.commission_rate, s.category_id,
           c.name as category_name,
           cs.is_recommend, cs.is_hot
    FROM sku s
    INNER JOIN community_sku cs ON cs.sku_id = s.id AND cs.community_id = ?
    INNER JOIN category c ON c.id = s.category_id
    WHERE s.status = 1
  `;
  const params = [communityId];

  if (categoryId > 0) {
    sql += ' AND s.category_id = ?';
    params.push(categoryId);
  }

  // 排序
  if (sort === 'price_asc') {
    sql += ' ORDER BY s.sale_price ASC';
  } else if (sort === 'price_desc') {
    sql += ' ORDER BY s.sale_price DESC';
  } else {
    sql += ' ORDER BY s.sales_count DESC';
  }

  // 计算总数
  let countSql = `
    SELECT COUNT(*) as total
    FROM sku s
    INNER JOIN community_sku cs ON cs.sku_id = s.id AND cs.community_id = ?
    WHERE s.status = 1
  `;
  const countParams = [communityId];
  if (categoryId > 0) {
    countSql += ' AND s.category_id = ?';
    countParams.push(categoryId);
  }
  const { total } = db.prepare(countSql).get(...countParams);

  sql += ' LIMIT ? OFFSET ?';
  params.push(pageSize, offset);

  const products = db.prepare(sql).all(...params);

  // 获取库存信息 (通过社区对应仓库)
  const warehouse = db.prepare(`
    SELECT wc.warehouse_id FROM warehouse_coverage wc
    WHERE wc.community_id = ? LIMIT 1
  `).get(communityId);

  const warehouseId = warehouse ? warehouse.warehouse_id : 1;

  const productsWithStock = products.map((p) => {
    const inv = db.prepare(`
      SELECT available_stock, locked_stock FROM inventory
      WHERE warehouse_id = ? AND sku_id = ?
    `).get(warehouseId, p.id);

    return {
      ...p,
      availableStock: inv ? inv.available_stock : 0,
      lockedStock: inv ? inv.locked_stock : 0,
      inStock: inv ? inv.available_stock > 0 : false,
      detail_images: undefined,
    };
  });

  return success(res, {
    list: productsWithStock,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
});

/**
 * GET /api/v1/products/search
 * 商品搜索
 * Query: keyword, page, pageSize, communityId
 */
router.get('/search', (req, res) => {
  const keyword = req.query.keyword || '';
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const communityId = parseInt(req.query.communityId) || 1;
  const offset = (page - 1) * pageSize;

  if (!keyword.trim()) {
    return success(res, { list: [], total: 0, page, pageSize, hasMore: false });
  }

  const likeKeyword = `%${keyword}%`;

  const { total } = db.prepare(`
    SELECT COUNT(*) as total FROM sku s
    INNER JOIN community_sku cs ON cs.sku_id = s.id AND cs.community_id = ?
    WHERE s.status = 1 AND (s.name LIKE ? OR s.subtitle LIKE ?)
  `).get(communityId, likeKeyword, likeKeyword);

  const products = db.prepare(`
    SELECT s.id, s.name, s.subtitle, s.main_image, s.unit,
           s.market_price, s.sale_price, s.sales_count, s.origin,
           s.category_id, c.name as category_name,
           cs.is_recommend, cs.is_hot
    FROM sku s
    INNER JOIN community_sku cs ON cs.sku_id = s.id AND cs.community_id = ?
    INNER JOIN category c ON c.id = s.category_id
    WHERE s.status = 1 AND (s.name LIKE ? OR s.subtitle LIKE ?)
    ORDER BY s.sales_count DESC
    LIMIT ? OFFSET ?
  `).all(communityId, likeKeyword, likeKeyword, pageSize, offset);

  // 获取库存
  const warehouse = db.prepare(`
    SELECT wc.warehouse_id FROM warehouse_coverage wc WHERE wc.community_id = ? LIMIT 1
  `).get(communityId);
  const warehouseId = warehouse ? warehouse.warehouse_id : 1;

  const productsWithStock = products.map((p) => {
    const inv = db.prepare(`
      SELECT available_stock FROM inventory WHERE warehouse_id = ? AND sku_id = ?
    `).get(warehouseId, p.id);
    return { ...p, availableStock: inv ? inv.available_stock : 0, inStock: inv ? inv.available_stock > 0 : false };
  });

  return success(res, {
    list: productsWithStock,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
});

/**
 * GET /api/v1/products/categories
 * 获取商品分类列表
 */
router.get('/categories', (req, res) => {
  const communityId = parseInt(req.query.communityId) || 1;

  const categories = db.prepare(`
    SELECT c.id, c.name, c.icon, c.sort_order
    FROM category c
    WHERE c.status = 1 AND c.parent_id = 0
    ORDER BY c.sort_order ASC
  `).all();

  return success(res, { list: categories });
});

/**
 * GET /api/v1/products/:id
 * 商品详情
 */
router.get('/:id', (req, res) => {
  const skuId = parseInt(req.params.id);
  const communityId = parseInt(req.query.communityId) || 1;

  const product = db.prepare(`
    SELECT s.*, c.name as category_name
    FROM sku s
    INNER JOIN category c ON c.id = s.category_id
    WHERE s.id = ? AND s.status = 1
  `).get(skuId);

  if (!product) {
    return error(res, '商品不存在或已下架', 404);
  }

  // 解析详情图
  let detailImages = [];
  try {
    detailImages = JSON.parse(product.detail_images || '[]');
  } catch (e) {
    detailImages = [];
  }

  // 获取规格
  const specs = db.prepare(`
    SELECT id, name, price FROM sku_spec WHERE sku_id = ? ORDER BY id ASC
  `).all(skuId);

  // 获取社区商品信息
  const commSku = db.prepare(`
    SELECT is_recommend, is_hot, sort_order FROM community_sku
    WHERE community_id = ? AND sku_id = ?
  `).get(communityId, skuId);

  // 获取库存
  const warehouse = db.prepare(`
    SELECT wc.warehouse_id FROM warehouse_coverage wc WHERE wc.community_id = ? LIMIT 1
  `).get(communityId);
  const warehouseId = warehouse ? warehouse.warehouse_id : 1;

  const inv = db.prepare(`
    SELECT available_stock, locked_stock, warning_threshold FROM inventory
    WHERE warehouse_id = ? AND sku_id = ?
  `).get(warehouseId, skuId);

  return success(res, {
    id: product.id,
    name: product.name,
    subtitle: product.subtitle,
    mainImage: product.main_image,
    detailImages,
    origin: product.origin,
    storageType: product.storage_type,
    unit: product.unit,
    costPrice: product.cost_price,
    marketPrice: product.market_price,
    salePrice: product.sale_price,
    commissionRate: product.commission_rate,
    salesCount: product.sales_count,
    categoryId: product.category_id,
    categoryName: product.category_name,
    specs,
    isRecommend: commSku ? !!commSku.is_recommend : false,
    isHot: commSku ? !!commSku.is_hot : false,
    availableStock: inv ? inv.available_stock : 0,
    lockedStock: inv ? inv.locked_stock : 0,
    warningThreshold: inv ? inv.warning_threshold : 20,
    inStock: inv ? inv.available_stock > 0 : false,
  });
});

module.exports = router;

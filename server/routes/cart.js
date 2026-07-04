const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error } = require('../helpers');

/**
 * POST /api/v1/cart/add
 * 加入购物车
 * Body: { skuId, skuSpecId?, quantity, communityId }
 */
router.post('/add', (req, res) => {
  const { skuId, skuSpecId, quantity = 1, communityId = 1 } = req.body;

  if (!skuId) {
    return error(res, '商品ID不能为空', 400);
  }

  // 检查商品是否存在
  const sku = db.prepare('SELECT id, name, sale_price, status FROM sku WHERE id = ? AND status = 1').get(skuId);
  if (!sku) {
    return error(res, '商品不存在或已下架', 404);
  }

  // 确定规格ID
  let specId = skuSpecId;
  if (!specId) {
    const spec = db.prepare('SELECT id FROM sku_spec WHERE sku_id = ? ORDER BY id ASC LIMIT 1').get(skuId);
    specId = spec ? spec.id : null;
  }

  // 检查是否已在购物车中 (同一商品同一规格)
  const existing = db.prepare(`
    SELECT id, quantity FROM cart_items
    WHERE user_id = ? AND sku_id = ? AND (sku_spec_id = ? OR (sku_spec_id IS NULL AND ? IS NULL))
    AND community_id = ?
  `).get(req.userId, skuId, specId, specId, communityId);

  if (existing) {
    // 更新数量
    const newQty = existing.quantity + quantity;
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(newQty, existing.id);
  } else {
    // 新增
    db.prepare(`
      INSERT INTO cart_items (user_id, sku_id, sku_spec_id, quantity, community_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.userId, skuId, specId, quantity, communityId);
  }

  return success(res, { skuId, quantity }, '已加入购物车');
});

/**
 * GET /api/v1/cart
 * 获取购物车列表
 * Query: communityId
 */
router.get('/', (req, res) => {
  const communityId = parseInt(req.query.communityId) || 1;

  const items = db.prepare(`
    SELECT ci.id, ci.sku_id, ci.sku_spec_id, ci.quantity, ci.community_id,
           s.name, s.subtitle, s.main_image, s.unit, s.market_price, s.sale_price,
           s.status as sku_status,
           ss.name as spec_name, ss.price as spec_price,
           c.name as category_name
    FROM cart_items ci
    INNER JOIN sku s ON s.id = ci.sku_id
    LEFT JOIN sku_spec ss ON ss.id = ci.sku_spec_id
    LEFT JOIN category c ON c.id = s.category_id
    WHERE ci.user_id = ? AND ci.community_id = ?
    ORDER BY ci.created_at DESC
  `).all(req.userId, communityId);

  // 获取库存信息
  const warehouse = db.prepare(`
    SELECT wc.warehouse_id FROM warehouse_coverage wc WHERE wc.community_id = ? LIMIT 1
  `).get(communityId);
  const warehouseId = warehouse ? warehouse.warehouse_id : 1;

  let totalAmount = 0;
  let totalCount = 0;

  const cartItems = items.map((item) => {
    const inv = db.prepare(`
      SELECT available_stock FROM inventory WHERE warehouse_id = ? AND sku_id = ?
    `).get(warehouseId, item.sku_id);

    const availableStock = inv ? inv.available_stock : 0;
    const price = item.spec_price || item.sale_price;
    const itemTotal = price * item.quantity;
    totalAmount += itemTotal;
    totalCount += item.quantity;

    return {
      id: item.id,
      skuId: item.sku_id,
      skuSpecId: item.sku_spec_id,
      name: item.name,
      subtitle: item.subtitle,
      mainImage: item.main_image,
      unit: item.unit,
      specName: item.spec_name,
      price,
      marketPrice: item.market_price,
      quantity: item.quantity,
      availableStock,
      inStock: availableStock > 0 && item.sku_status === 1,
      isValid: item.sku_status === 1 && availableStock > 0,
      categoryName: item.category_name,
      itemTotal: parseFloat(itemTotal.toFixed(2)),
    };
  });

  // 配送费规则: 满29免配送费, 否则3元
  const deliveryFee = totalAmount >= 29 ? 0 : (totalAmount > 0 ? 3 : 0);

  return success(res, {
    list: cartItems,
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    totalCount,
    deliveryFee,
    payAmount: parseFloat((totalAmount + deliveryFee).toFixed(2)),
  });
});

/**
 * PUT /api/v1/cart/update
 * 更新购物车商品数量
 * Body: { id, quantity }
 */
router.put('/update', (req, res) => {
  const { id, quantity, selected } = req.body;

  if (!id) {
    return error(res, '参数错误', 400);
  }

  const item = db.prepare('SELECT id FROM cart_items WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!item) {
    return error(res, '购物车商品不存在', 404);
  }

  if (quantity !== undefined && quantity > 0) {
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(quantity, id);
  }
  // selected field is handled client-side for demo (no DB column for it)

  return success(res, { id, quantity, selected }, '更新成功');
});

/**
 * DELETE /api/v1/cart/remove
 * 删除购物车商品
 * Body: { id } 或 { ids: [1,2,3] }
 */
router.delete('/remove', (req, res) => {
  const { id, ids } = req.body;

  if (id) {
    db.prepare('DELETE FROM cart_items WHERE id = ? AND user_id = ?').run(id, req.userId);
  } else if (ids && Array.isArray(ids) && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM cart_items WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, req.userId);
  } else {
    return error(res, '请指定要删除的商品', 400);
  }

  return success(res, null, '删除成功');
});

module.exports = router;

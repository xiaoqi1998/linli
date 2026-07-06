const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, error } = require('../helpers');

/**
 * GET /api/v1/user/addresses
 * 获取用户地址列表
 */
router.get('/addresses', (req, res) => {
  const addresses = db.prepare(`
    SELECT id, contact_name, contact_phone, province, city, district,
           detail_address, latitude, longitude, is_default, created_at
    FROM user_address
    WHERE user_id = ?
    ORDER BY is_default DESC, updated_at DESC
  `).all(req.userId);

  const result = addresses.map((a) => ({
    ...a,
    isDefault: !!a.is_default,
  }));

  return success(res, { list: result });
});

/**
 * POST /api/v1/user/addresses
 * 新增地址
 * Body: { contactName, contactPhone, province, city, district, detailAddress, latitude?, longitude?, isDefault? }
 */
router.post('/addresses', (req, res) => {
  const { contactName, contactPhone, province, city, district, detailAddress, latitude, longitude, isDefault } = req.body;

  if (!contactName || !contactPhone || !detailAddress) {
    return error(res, '联系人、手机号、详细地址不能为空', 400);
  }

  // 如果设为默认, 先取消其他默认地址
  if (isDefault) {
    db.prepare('UPDATE user_address SET is_default = 0 WHERE user_id = ?').run(req.userId);
  }

  const result = db.prepare(`
    INSERT INTO user_address (user_id, contact_name, contact_phone, province, city, district, detail_address, latitude, longitude, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.userId, contactName, contactPhone, province || '', city || '', district || '', detailAddress, latitude || null, longitude || null, isDefault ? 1 : 0);

  return success(res, { id: result.lastInsertRowid }, '地址添加成功');
});

/**
 * PUT /api/v1/user/addresses/:id
 * 修改地址
 */
router.put('/addresses/:id', (req, res) => {
  const addrId = parseInt(req.params.id);
  const { contactName, contactPhone, province, city, district, detailAddress, latitude, longitude, isDefault } = req.body;

  const existing = db.prepare('SELECT id FROM user_address WHERE id = ? AND user_id = ?').get(addrId, req.userId);
  if (!existing) {
    return error(res, '地址不存在', 404);
  }

  if (isDefault) {
    db.prepare('UPDATE user_address SET is_default = 0 WHERE user_id = ?').run(req.userId);
  }

  db.prepare(`
    UPDATE user_address SET
      contact_name = ?, contact_phone = ?, province = ?, city = ?,
      district = ?, detail_address = ?, latitude = ?, longitude = ?,
      is_default = ?, updated_at = datetime('localtime')
    WHERE id = ? AND user_id = ?
  `).run(
    contactName, contactPhone, province || '', city || '',
    district || '', detailAddress, latitude || null, longitude || null,
    isDefault ? 1 : 0, addrId, req.userId
  );

  return success(res, { id: addrId }, '地址更新成功');
});

/**
 * DELETE /api/v1/user/addresses/:id
 * 删除地址
 */
router.delete('/addresses/:id', (req, res) => {
  const addrId = parseInt(req.params.id);

  const existing = db.prepare('SELECT id, is_default FROM user_address WHERE id = ? AND user_id = ?').get(addrId, req.userId);
  if (!existing) {
    return error(res, '地址不存在', 404);
  }

  db.prepare('DELETE FROM user_address WHERE id = ? AND user_id = ?').run(addrId, req.userId);

  // 如果删除的是默认地址, 将第一条设为默认
  if (existing.is_default) {
    const first = db.prepare('SELECT id FROM user_address WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1').get(req.userId);
    if (first) {
      db.prepare('UPDATE user_address SET is_default = 1 WHERE id = ?').run(first.id);
    }
  }

  return success(res, null, '地址删除成功');
});

module.exports = router;

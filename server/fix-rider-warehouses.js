/**
 * 临时修复脚本：让所有骑手关联全部站点
 * 执行方式：node server/fix-rider-warehouses.js
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'linli_fresh.db');
const db = new Database(dbPath);

try {
  const riders = db.prepare('SELECT id FROM rider WHERE status = 1').all();
  const warehouses = db.prepare('SELECT id FROM warehouse WHERE status = 1 ORDER BY id').all();

  if (riders.length === 0) {
    console.error('错误：没有可用的骑手数据');
    process.exit(1);
  }
  if (warehouses.length === 0) {
    console.error('错误：没有可用的站点数据');
    process.exit(1);
  }

  console.log(`发现 ${riders.length} 名骑手，${warehouses.length} 个站点`);

  const deleteRw = db.prepare('DELETE FROM rider_warehouse');
  const insertRw = db.prepare('INSERT INTO rider_warehouse (rider_id, warehouse_id, is_default, status) VALUES (?, ?, ?, 1)');

  const txn = db.transaction(() => {
    deleteRw.run();
    for (const rider of riders) {
      for (let widx = 0; widx < warehouses.length; widx++) {
        const wh = warehouses[widx];
        const isDefault = widx === 0 ? 1 : 0;
        insertRw.run(rider.id, wh.id, isDefault);
      }
    }
  });

  txn();
  console.log(`修复完成：已为 ${riders.length} 名骑手关联 ${warehouses.length} 个站点，共 ${riders.length * warehouses.length} 条记录`);
} catch (e) {
  console.error('修复失败:', e.message);
  process.exit(1);
} finally {
  db.close();
}

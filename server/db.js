const Database = require('better-sqlite3');
const path = require('path');

// 支持通过环境变量指定数据库路径 (Docker 持久化挂载)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'linli_fresh.db');
const db = new Database(DB_PATH);

// 启用 WAL 模式和外键约束
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================================================
// 创建所有表 (SQLite 兼容: INTEGER 代替 BIGINT/INT, TEXT 代替 VARCHAR, REAL 代替 DECIMAL)
// ============================================================================

db.exec(`
-- ----------------------------------------------------------------------------
-- 1. 用户表 (Web 端账号体系: 手机号 + 密码登录)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  nick_name TEXT,
  avatar_url TEXT,
  email TEXT,
  member_level INTEGER NOT NULL DEFAULT 1,
  total_consume REAL NOT NULL DEFAULT 0.00,
  order_count INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'search',
  status INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_phone ON user(phone);

-- ----------------------------------------------------------------------------
-- 2. 用户地址表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_address (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  province TEXT,
  city TEXT,
  district TEXT,
  detail_address TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id)
);
CREATE INDEX IF NOT EXISTS idx_user_address_user_id ON user_address(user_id);

-- ----------------------------------------------------------------------------
-- 3. 城市表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS city (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT,
  latitude REAL,
  longitude REAL,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 4. 社区表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  latitude REAL,
  longitude REAL,
  household_count INTEGER NOT NULL DEFAULT 0,
  leader_id INTEGER,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (city_id) REFERENCES city(id)
);
CREATE INDEX IF NOT EXISTS idx_community_city_id ON community(city_id);

-- ----------------------------------------------------------------------------
-- 5. 前置仓表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warehouse (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  latitude REAL,
  longitude REAL,
  radius REAL NOT NULL DEFAULT 3.0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (city_id) REFERENCES city(id)
);

-- ----------------------------------------------------------------------------
-- 6. 仓库覆盖表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warehouse_coverage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id INTEGER NOT NULL,
  community_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(warehouse_id, community_id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouse(id),
  FOREIGN KEY (community_id) REFERENCES community(id)
);
CREATE INDEX IF NOT EXISTS idx_wc_community_id ON warehouse_coverage(community_id);

-- ----------------------------------------------------------------------------
-- 7. 商品分类表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS category (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_category_parent_id ON category(parent_id);

-- ----------------------------------------------------------------------------
-- 8. 商品 SKU 表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sku (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spu_id INTEGER NOT NULL DEFAULT 0,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  subtitle TEXT,
  main_image TEXT NOT NULL,
  detail_images TEXT,
  origin TEXT,
  storage_type TEXT,
  unit TEXT NOT NULL,
  cost_price REAL NOT NULL DEFAULT 0.00,
  market_price REAL NOT NULL DEFAULT 0.00,
  sale_price REAL NOT NULL DEFAULT 0.00,
  commission_rate REAL NOT NULL DEFAULT 8.00,
  sales_count INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES category(id)
);
CREATE INDEX IF NOT EXISTS idx_sku_category_id ON sku(category_id);
CREATE INDEX IF NOT EXISTS idx_sku_status ON sku(status);

-- ----------------------------------------------------------------------------
-- 9. 商品规格表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sku_spec (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0.00,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sku_id) REFERENCES sku(id)
);
CREATE INDEX IF NOT EXISTS idx_sku_spec_sku_id ON sku_spec(sku_id);

-- ----------------------------------------------------------------------------
-- 10. 社区商品表 (千区千面)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_sku (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id INTEGER NOT NULL,
  sku_id INTEGER NOT NULL,
  is_recommend INTEGER NOT NULL DEFAULT 0,
  is_hot INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(community_id, sku_id),
  FOREIGN KEY (community_id) REFERENCES community(id),
  FOREIGN KEY (sku_id) REFERENCES sku(id)
);
CREATE INDEX IF NOT EXISTS idx_community_sku_community ON community_sku(community_id);

-- ----------------------------------------------------------------------------
-- 11. 库存表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id INTEGER NOT NULL,
  sku_id INTEGER NOT NULL,
  available_stock INTEGER NOT NULL DEFAULT 0,
  locked_stock INTEGER NOT NULL DEFAULT 0,
  warning_threshold INTEGER NOT NULL DEFAULT 20,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(warehouse_id, sku_id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouse(id),
  FOREIGN KEY (sku_id) REFERENCES sku(id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_sku_id ON inventory(sku_id);

-- ----------------------------------------------------------------------------
-- 12. 订单表 (order 是 SQLite 保留字, 需要用双引号)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "order" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  community_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  leader_id INTEGER,
  rider_id INTEGER,
  address_id INTEGER,
  address_snapshot TEXT,
  status INTEGER NOT NULL DEFAULT 10,
  delivery_type INTEGER NOT NULL DEFAULT 1,
  delivery_time_type INTEGER NOT NULL DEFAULT 1,
  delivery_time_slot TEXT,
  delivery_fee REAL NOT NULL DEFAULT 0.00,
  sku_total_amount REAL NOT NULL DEFAULT 0.00,
  discount_amount REAL NOT NULL DEFAULT 0.00,
  coupon_id INTEGER,
  coupon_discount REAL NOT NULL DEFAULT 0.00,
  pay_amount REAL NOT NULL DEFAULT 0.00,
  remark TEXT,
  pay_status INTEGER NOT NULL DEFAULT 0,
  pay_time TEXT,
  pay_way INTEGER,
  pay_user_id INTEGER,
  wx_transaction_id TEXT,
  rider_accept_time TEXT,
  rider_pick_time TEXT,
  delivered_time TEXT,
  completed_time TEXT,
  cancel_time TEXT,
  cancel_reason TEXT,
  auto_confirm_time TEXT,
  commission_settled INTEGER NOT NULL DEFAULT 0,
  commission_amount REAL NOT NULL DEFAULT 0.00,
  source TEXT NOT NULL DEFAULT 'normal',
  group_buy_id INTEGER,
  expire_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id),
  FOREIGN KEY (community_id) REFERENCES community(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouse(id)
);
CREATE INDEX IF NOT EXISTS idx_order_user_id ON "order"(user_id);
CREATE INDEX IF NOT EXISTS idx_order_community_id ON "order"(community_id);
CREATE INDEX IF NOT EXISTS idx_order_status ON "order"(status);
CREATE INDEX IF NOT EXISTS idx_order_leader_id ON "order"(leader_id);

-- ----------------------------------------------------------------------------
-- 13. 订单项表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  sku_id INTEGER NOT NULL,
  sku_spec_id INTEGER,
  sku_name TEXT NOT NULL,
  sku_image TEXT,
  spec_name TEXT,
  price REAL NOT NULL DEFAULT 0.00,
  quantity INTEGER NOT NULL DEFAULT 1,
  commission_rate REAL NOT NULL DEFAULT 8.00,
  commission_amount REAL NOT NULL DEFAULT 0.00,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES "order"(id),
  FOREIGN KEY (sku_id) REFERENCES sku(id)
);
CREATE INDEX IF NOT EXISTS idx_order_item_order_id ON order_item(order_id);

-- ----------------------------------------------------------------------------
-- 14. 订单状态日志表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_status_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  from_status INTEGER,
  to_status INTEGER NOT NULL,
  operator TEXT,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES "order"(id)
);
CREATE INDEX IF NOT EXISTS idx_order_status_log_order_id ON order_status_log(order_id);

-- ----------------------------------------------------------------------------
-- 15. 支付流水表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_transaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  transaction_no TEXT NOT NULL UNIQUE,
  amount REAL NOT NULL DEFAULT 0.00,
  pay_way INTEGER,
  status INTEGER NOT NULL DEFAULT 0,
  wx_transaction_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES "order"(id)
);
CREATE INDEX IF NOT EXISTS idx_payment_order_id ON payment_transaction(order_id);

-- ----------------------------------------------------------------------------
-- 16. 佣金结算表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commission_settlement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leader_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  amount REAL NOT NULL DEFAULT 0.00,
  status INTEGER NOT NULL DEFAULT 0,
  settled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(leader_id, order_id)
);
CREATE INDEX IF NOT EXISTS idx_commission_leader_id ON commission_settlement(leader_id);

-- ----------------------------------------------------------------------------
-- 17. 团长提现表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leader_withdraw (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leader_id INTEGER NOT NULL,
  withdraw_no TEXT NOT NULL UNIQUE,
  amount REAL NOT NULL DEFAULT 0.00,
  status INTEGER NOT NULL DEFAULT 0,
  reject_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (leader_id) REFERENCES leader(id)
);
CREATE INDEX IF NOT EXISTS idx_leader_withdraw_leader_id ON leader_withdraw(leader_id);

-- ----------------------------------------------------------------------------
-- 18. 优惠券表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupon (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type INTEGER NOT NULL DEFAULT 1,
  face_value REAL NOT NULL DEFAULT 0.00,
  min_order_amount REAL NOT NULL DEFAULT 0.00,
  applicable_type INTEGER NOT NULL DEFAULT 1,
  applicable_ids TEXT,
  applicable_communities TEXT,
  valid_start TEXT,
  valid_end TEXT,
  total_count INTEGER NOT NULL DEFAULT 0,
  issued_count INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 19. 用户优惠券表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_coupon (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  coupon_id INTEGER NOT NULL,
  status INTEGER NOT NULL DEFAULT 0,
  valid_start TEXT,
  valid_end TEXT,
  used_order_id INTEGER,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id),
  FOREIGN KEY (coupon_id) REFERENCES coupon(id)
);
CREATE INDEX IF NOT EXISTS idx_user_coupon_user_id ON user_coupon(user_id);

-- ----------------------------------------------------------------------------
-- 20. 积分流水表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS point_transaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type INTEGER NOT NULL DEFAULT 1,
  points INTEGER NOT NULL DEFAULT 0,
  balance INTEGER NOT NULL DEFAULT 0,
  remark TEXT,
  order_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id)
);
CREATE INDEX IF NOT EXISTS idx_point_transaction_user_id ON point_transaction(user_id);

-- ----------------------------------------------------------------------------
-- 21. 团长表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leader (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  community_id INTEGER NOT NULL,
  commission_rate REAL NOT NULL DEFAULT 8.00,
  total_commission REAL NOT NULL DEFAULT 0.00,
  withdrawable_commission REAL NOT NULL DEFAULT 0.00,
  withdrawn_commission REAL NOT NULL DEFAULT 0.00,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id),
  FOREIGN KEY (community_id) REFERENCES community(id)
);
CREATE INDEX IF NOT EXISTS idx_leader_community_id ON leader(community_id);
CREATE INDEX IF NOT EXISTS idx_leader_user_id ON leader(user_id);

-- ----------------------------------------------------------------------------
-- 22. 拼团表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_buy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leader_id INTEGER NOT NULL,
  community_id INTEGER NOT NULL,
  sku_id INTEGER NOT NULL,
  sku_spec_id INTEGER,
  group_price REAL NOT NULL DEFAULT 0.00,
  target_count INTEGER NOT NULL DEFAULT 2,
  joined_count INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  expire_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (leader_id) REFERENCES leader(id),
  FOREIGN KEY (community_id) REFERENCES community(id),
  FOREIGN KEY (sku_id) REFERENCES sku(id)
);
CREATE INDEX IF NOT EXISTS idx_group_buy_community_id ON group_buy(community_id);
CREATE INDEX IF NOT EXISTS idx_group_buy_status ON group_buy(status);

-- ----------------------------------------------------------------------------
-- 23. 拼团参与者表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_buy_participant (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_buy_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  order_id INTEGER,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_buy_id) REFERENCES group_buy(id),
  FOREIGN KEY (user_id) REFERENCES user(id)
);
CREATE INDEX IF NOT EXISTS idx_gbp_group_buy_id ON group_buy_participant(group_buy_id);

-- ----------------------------------------------------------------------------
-- 24. 骑手表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rider (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  warehouse_id INTEGER NOT NULL,
  status INTEGER NOT NULL DEFAULT 1,
  lat REAL,
  lng REAL,
  current_orders INTEGER NOT NULL DEFAULT 0,
  location_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (warehouse_id) REFERENCES warehouse(id)
);
CREATE INDEX IF NOT EXISTS idx_rider_warehouse_id ON rider(warehouse_id);

-- ----------------------------------------------------------------------------
-- 25. 骑手配送表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rider_delivery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  rider_id INTEGER NOT NULL,
  status INTEGER NOT NULL DEFAULT 0,
  accept_time TEXT,
  pick_time TEXT,
  deliver_time TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES "order"(id),
  FOREIGN KEY (rider_id) REFERENCES rider(id)
);
CREATE INDEX IF NOT EXISTS idx_rider_delivery_order_id ON rider_delivery(order_id);
CREATE INDEX IF NOT EXISTS idx_rider_delivery_rider_id ON rider_delivery(rider_id);

-- ----------------------------------------------------------------------------
-- 26. 退款表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refund (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  amount REAL NOT NULL DEFAULT 0.00,
  reason TEXT,
  images TEXT,
  status INTEGER NOT NULL DEFAULT 0,
  leader_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES "order"(id),
  FOREIGN KEY (user_id) REFERENCES user(id)
);
CREATE INDEX IF NOT EXISTS idx_refund_order_id ON refund(order_id);

-- ----------------------------------------------------------------------------
-- 27. 管理员用户表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  real_name TEXT,
  role_id INTEGER,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES admin_role(id)
);

-- ----------------------------------------------------------------------------
-- 28. 管理员角色表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_role (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  permissions TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 29. 管理日志表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admin_user(id)
);
CREATE INDEX IF NOT EXISTS idx_admin_log_admin_id ON admin_log(admin_id);

-- ----------------------------------------------------------------------------
-- 30. 购物车表 (Demo 用 SQLite 存储, 非Redis)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  sku_id INTEGER NOT NULL,
  sku_spec_id INTEGER,
  quantity INTEGER NOT NULL DEFAULT 1,
  community_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id),
  FOREIGN KEY (sku_id) REFERENCES sku(id)
);
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_user_community ON cart_items(user_id, community_id);

-- ----------------------------------------------------------------------------
-- 31. 用户消息表 (通知系统)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_message (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  content TEXT,
  order_id INTEGER,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id)
);
CREATE INDEX IF NOT EXISTS idx_user_message_user_id ON user_message(user_id);
CREATE INDEX IF NOT EXISTS idx_user_message_is_read ON user_message(is_read);
`);

module.exports = db;



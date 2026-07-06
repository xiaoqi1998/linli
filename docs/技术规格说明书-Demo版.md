## 一、技术选型

### 1.1 整体技术栈

| 层级   | 技术                           | 说明                                |
| ---- | ---------------------------- | --------------------------------- |
| 用户端  | Vue 3 + Vite + Vant 4（移动端H5） | 移动端 H5 单页应用，响应式适配主流移动浏览器          |
| 团长端  | Vue 3 + Vite + Vant 4        | 团长管理 H5 应用，与用户端共用组件库              |
| 运营后台 | Vue 3 + Vite + Element Plus  | PC 端管理后台，Element Plus 提供丰富表格/表单组件 |
| 后端   | NestJS + TypeScript          | 模块化架构，依赖注入，TypeORM ORM            |
| 数据库  | MySQL 8.0                    | utf8mb4 字符集，支持事务与行级锁              |
| 缓存   | Redis 7                      | 缓存 + 分布式锁 + 消息队列（Stream）          |
| 消息队列 | Redis Stream                 | 轻量级异步任务处理，Demo 阶段无需引入 Kafka       |

### 1.2 支付方案

| 能力     | 方案                 | 说明                        |
| ------ | ------------------ | ------------------------- |
| Web 支付 | 支付宝当面付 / 微信H5支付    | 用户端 H5 跳转至支付宝或微信支付页面完成付款  |
| 支付组件   | 支付宝Web支付 + 微信H5支付  | 后端统一封装支付网关，前端按用户选择的支付方式跳转 |
| 支付回调   | 支付宝异步通知 + 微信支付回调   | 双通道异步回调，服务端验签后更新订单状态      |
| 团长提现   | 支付宝转账 / 微信企业付款到银行卡 | T+1 结算后支持团长发起提现申请         |

### 1.3 地图与定位

| 能力           | 方案                  | 说明                          |
| ------------ | ------------------- | --------------------------- |
| 地理编码 / 逆地理编码 | 腾讯地图 WebService API | 服务端调用，地址与经纬度互转              |
| 前端定位         | 浏览器 Geolocation API | H5 页面获取用户当前位置，用于社区匹配与骑手距离计算 |
| 距离计算         | Haversine 公式        | 服务端计算两点间直线距离                |

### 1.4 通知方案

| 场景     | 方案              | 说明                          |
| ------ | --------------- | --------------------------- |
| 订单状态变更 | 短信通知 + Web 推送通知 | 短信模板用于关键节点，Web 推送用于在线用户实时提醒 |
| 佣金结算   | 短信通知            | 团长佣金到账短信提醒                  |
| 验证码    | 短信验证码           | 注册、绑定手机号场景使用                |

***

## 二、数据库设计

### 2.1 用户表（user）

```sql
CREATE TABLE user (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(64) NOT NULL COMMENT 'AES加密存储',
  phone_verified TINYINT NOT NULL DEFAULT 0 COMMENT '是否已验证手机号 0否 1是',
  password_hash VARCHAR(128) NOT NULL COMMENT 'bcrypt哈希，成本因子12',
  email VARCHAR(128) NULL COMMENT '邮箱（可选）',
  nick_name VARCHAR(64) NULL,
  avatar_url VARCHAR(256) NULL,
  member_level TINYINT NOT NULL DEFAULT 1 COMMENT '1新邻居 2老熟人 3老街坊',
  total_consume DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  order_count INT UNSIGNED NOT NULL DEFAULT 0,
  points INT UNSIGNED NOT NULL DEFAULT 0,
  source VARCHAR(32) NOT NULL DEFAULT 'web' COMMENT 'web/share/direct',
  last_login_at DATETIME NULL COMMENT '最后登录时间',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '1正常 2禁用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_phone (phone),
  KEY idx_email (email),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';
```

**设计要点：**

1. 使用 `phone` + `password_hash` 实现手机号密码登录，密码采用 bcrypt 哈希存储（成本因子 12）。
2. `phone_verified` 字段标记手机号是否已通过短信验证码验证。
3. `email` 字段为可选项，支持后续邮箱找回密码等功能。
4. `source` 字段记录用户来源，取值为 `web`（网页访问）、`share`（分享链接进入）、`direct`（直接访问）。
5. `last_login_at` 记录用户最后登录时间，用于活跃度分析与安全审计。
6. 手机号采用 AES-256-CBC 加密存储，密钥由环境变量注入。

### 2.2 其他核心表

| 表名                      | 说明     | 核心字段                                                       |
| ----------------------- | ------ | ---------------------------------------------------------- |
| `user_address`          | 用户收货地址 | user\_id, community\_id, lat, lng, address\_snapshot       |
| `sku`                   | 商品 SKU | spu\_id, category\_id, sale\_price, commission\_rate       |
| `inventory`             | 库存     | warehouse\_id, sku\_id, available\_stock, locked\_stock    |
| `order`                 | 订单     | order\_no, user\_id, status, pay\_amount, transaction\_id  |
| `order_item`            | 订单项    | order\_id, sku\_id, quantity, price, commission\_amount    |
| `payment_transaction`   | 支付流水   | order\_no, channel(alipay/wechat), transaction\_id, amount |
| `leader`                | 团长     | user\_id, community\_id, withdrawable\_commission          |
| `commission_settlement` | 佣金结算   | leader\_id, order\_id, amount, settled\_at                 |
| `leader_withdraw`       | 团长提现   | leader\_id, amount, channel, status                        |
| `group_buy`             | 拼团     | leader\_id, sku\_id, target\_count, expire\_at             |
| `group_buy_participant` | 拼团参与者  | group\_buy\_id, user\_id, status                           |

***

## 三、API 接口设计

### 3.1 认证相关接口

#### 3.1.1 手机号+密码登录

```
POST /api/v1/auth/login
请求体：{ "phone": "13800138000", "password": "user_password" }
响应：{ "token": "eyJhbG...", "expiresIn": 7200, "user": { "id": 10001, "nickName": "张三" } }
```

**逻辑：**

1. 根据手机号（AES 加密后）查询 user 表。
2. 使用 bcrypt.compare 校验密码哈希。
3. 校验通过后签发 JWT Token，更新 `last_login_at`。
4. 用户不存在或密码错误 → 返回 401001（手机号或密码错误）。
5. 用户被禁用（status=2）→ 返回 401002（账号已被禁用）。

#### 3.1.2 手机号+密码注册

```
POST /api/v1/auth/register
请求体：{ "phone": "13800138000", "password": "user_password", "smsCode": "123456" }
响应：{ "token": "eyJhbG...", "user": { "id": 10002, "nickName": "新邻居" } }
```

**逻辑：**

1. 校验短信验证码（Redis 中存储，5 分钟有效期）。
2. 校验手机号是否已注册（查 user 表 phone 唯一索引）。
3. 密码 bcrypt 哈希后存入 user 表，phone\_verified = 1。
4. 签发 JWT Token，返回用户信息。
5. 手机号已注册 → 返回 409001（该手机号已注册）。

#### 3.1.3 发送短信验证码

```
POST /api/v1/auth/send-sms
请求体：{ "phone": "13800138000", "scene": "register" }
响应：{ "success": true }
```

**逻辑：**

1. 限流：同一手机号 60 秒内只能发送一次，同一 IP 每日最多 10 次。
2. 生成 6 位随机验证码，存入 Redis（key: `sms:code:{phone}:{scene}`，TTL 300 秒）。
3. 调用短信服务商 API 发送验证码。
4. scene 取值：`register`（注册）、`verify_phone`（验证手机号）、`reset_password`（重置密码）。

#### 3.1.4 短信验证码验证手机号

```
POST /api/v1/auth/verify-phone
请求头：Authorization: Bearer {token}
请求体：{ "phone": "13800138000", "smsCode": "123456" }
响应：{ "verified": true }
```

**逻辑：**

1. 校验用户登录态（JWT Token）。
2. 从 Redis 读取验证码并比对。
3. 验证通过后更新 `user.phone_verified = 1`。
4. 验证码错误 → 返回 400001（验证码错误或已过期）。

### 3.2 支付相关接口

#### 3.2.1 发起支付

```
POST /api/v1/orders/:orderNo/pay
请求头：Authorization: Bearer {token}
请求体：{ "channel": "alipay" | "wechat_h5" }
响应：{ "payUrl": "https://openapi.alipay.com/...", "orderNo": "O2026070312000123" }
```

**逻辑：**

1. 校验订单状态为"待付款"（status=10）。
2. 根据 channel 调用对应支付网关：
   - alipay → 调用支付宝当面付预创建接口，返回支付链接。
   - wechat\_h5 → 调用微信 H5 支付统一下单接口，返回 mweb\_url。
3. 将 payUrl 返回前端，前端跳转到 Web 支付页面完成付款。
4. 记录 payment\_transaction 流水。

#### 3.2.2 支付回调

```
POST /api/v1/webhooks/payment/alipay    # 支付宝异步通知
POST /api/v1/webhooks/payment/wechat    # 微信支付回调
```

**逻辑：**

1. 支付宝回调：RSA 签名验证 → 解析 trade\_status → 更新订单状态。
2. 微信回调：Wechatpay-Signature 验签 → 解析 trade\_state → 更新订单状态。
3. 幂等性：同一 transaction\_id 只处理一次（Redis 去重 + 数据库唯一索引）。
4. 金额一致性校验：回调金额必须等于订单 pay\_amount。
5. 更新订单状态为"待配送"，释放预占库存（locked\_stock → 真实扣减）。
6. 触发 `order.paid` 事件，进入骑手派单流程。

#### 3.2.3 团长提现

```
POST /api/v1/leader/withdraw
请求头：Authorization: Bearer {token}
请求体：{ "amount": 100.00, "channel": "alipay" | "wechat_bank" }
响应：{ "withdrawNo": "W20260703120001", "status": "processing" }
```

**逻辑：**

1. 校验团长可提现佣金余额 >= 提现金额。
2. 冻结提现金额（leader.withdrawable\_commission 扣减）。
3. 创建 leader\_withdraw 记录（status=processing）。
4. 异步调用提现接口：
   - alipay → 支付宝转账接口。
   - wechat\_bank → 微信企业付款到银行卡接口。
5. 转账成功 → 更新 status=success；转账失败 → 回滚冻结金额，status=failed。
6. 发送短信通知团长提现结果。

***

## 四、核心业务逻辑详述

### 4.1 库存扣减与预占机制

库存是电商系统最核心的资源，必须保证高并发下的准确性与一致性。Demo 阶段采用"Redis 预占 + MySQL 确认 + 定时回补"的三层防护机制。

#### 4.1.1 库存数据模型

```
MySQL inventory 表（权威数据源）：
  available_stock = 可售库存（用户可见）
  locked_stock = 已锁定库存（未支付订单占用）
  real_stock = available_stock + locked_stock

Redis 缓存（加速读取）：
  key: stock:sku:{skuId}:warehouse:{warehouseId}
  value: { "available": 15, "locked": 5, "version": 123 }
  TTL: 300 秒
```

#### 4.1.2 下单时的库存扣减流程

```
用户提交订单
    ↓
Step 1: 参数校验（商品、规格、社区、库存数量）
    ↓
Step 2: Redis 分布式锁（防止同一用户重复提交 + 防止并发超卖）
  - 锁 Key: lock:order:submit:{userId}
  - TTL: 10 秒
  - 获取失败 → 返回"操作太频繁，请稍后再试"
    ↓
Step 3: 幂等性校验
  - Redis Key: submit_order:{userId}:{itemsHash}
  - 若存在且未过期 → 返回已有订单
    ↓
Step 4: Redis 库存预占（快速失败）
  - Lua 原子脚本：
    local key = KEYS[1]
    local need = tonumber(ARGV[1])
    local stock = redis.call('HMGET', key, 'available', 'version')
    local available = tonumber(stock[1])
    if available < need then
      return {-1, available}  -- 库存不足
    end
    redis.call('HINCRBY', key, 'available', -need)
    redis.call('HINCRBY', key, 'locked', need)
    redis.call('HINCRBY', key, 'version', 1)
    return {1, available - need}  -- 成功，返回剩余库存
  - 若 Redis 缓存未命中 → 查 MySQL 并回写 Redis，再执行 Lua
  - 若 Redis 返回库存不足 → 直接返回 409001，不进入数据库事务
    ↓
Step 5: 开启 MySQL 事务（REPEATABLE READ）
  - UPDATE inventory SET available_stock = available_stock - ?, locked_stock = locked_stock + ?
    WHERE warehouse_id = ? AND sku_id = ? AND available_stock >= ?
  - 影响行数 = 0 → 回滚，Redis 回补，返回 409001
    ↓
Step 6: 创建订单、订单项、优惠券扣减、清空购物车
    ↓
Step 7: 提交事务
    ↓
Step 8: 释放分布式锁
    ↓
Step 9: 设置订单过期扫描任务（Redis Key 过期事件或定时任务）
```

#### 4.1.3 订单超时未支付的库存回补

```
触发方式：定时任务（每 1 分钟扫描）+ Redis Key 过期事件（备用）

定时任务逻辑：
  SELECT * FROM `order` 
  WHERE status = 10 AND expire_at < NOW() 
  LIMIT 100 FOR UPDATE SKIP LOCKED;

  对每个超时订单：
    1. 开启事务
    2. UPDATE `order` SET status = 99, cancel_time = NOW(), cancel_reason = '超时未支付' WHERE id = ?
    3. 遍历 order_item：
       UPDATE inventory SET locked_stock = locked_stock - ?, available_stock = available_stock + ?
       WHERE warehouse_id = ? AND sku_id = ?
    4. 若使用了优惠券 → UPDATE user_coupon SET status = 0, used_order_id = NULL WHERE id = ?
    5. 记录 order_status_log
    6. 提交事务
    7. 更新 Redis 库存缓存（HMSET）
    8. 发送Web推送通知/短信通知给用户："您的订单已超时取消，商品已放回库存"
```

#### 4.1.4 支付成功后的库存确认

```
支付回调触发
    ↓
订单状态从"待付款"更新为"待配送"
    ↓
UPDATE inventory SET locked_stock = locked_stock - ? 
WHERE warehouse_id = ? AND sku_id = ?
（无需修改 available_stock，因为支付成功意味着真正售出）
    ↓
更新 Redis 缓存（减少 locked 值）
```

#### 4.1.5 售后退款的库存回补

```
售后审核通过
    ↓
订单状态更新为"已退款"
    ↓
UPDATE inventory SET available_stock = available_stock + ?
WHERE warehouse_id = ? AND sku_id = ?
（退款商品重新上架，无需走 locked_stock）
    ↓
更新 Redis 缓存
```

### 4.2 骑手派单算法

派单是即时配送的核心，目标是最小化平均配送时长。Demo 阶段采用"贪婪最近邻 + 负载均衡"的简单有效策略。

#### 4.2.1 骑手状态模型

```
骑手数据结构（Redis Hash）：
  key: rider:{riderId}
  value: {
    "status": 1,        // 1空闲 2配送中 3离线
    "lat": 22.5431,
    "lng": 113.9465,
    "currentOrders": 0, // 当前已接单未送达数
    "warehouseId": 1,
    "updateTime": 1688356800
  }
```

#### 4.2.2 自动派单算法

```python
def dispatch_order(order):
    warehouse_id = order.warehouse_id
    order_lat = order.address_lat
    order_lng = order.address_lng
    
    # Step 1: 获取该前置仓下所有在职且在线的骑手
    riders = redis.hgetall(f"warehouse:{warehouse_id}:riders")
    available_riders = []
    
    for rider_id, rider_info in riders.items():
        r = json.loads(rider_info)
        if r['status'] == 1 and r['currentOrders'] < 3:  # 空闲且订单 < 3
            # 计算骑手到订单地址的直线距离（米）
            distance = haversine(r['lat'], r['lng'], order_lat, order_lng)
            available_riders.append({
                'riderId': rider_id,
                'distance': distance,
                'currentOrders': r['currentOrders']
            })
    
    if not available_riders:
        # 无可用骑手 → 标记为异常订单，进入人工调度队列
        mark_exception_order(order, reason='NO_AVAILABLE_RIDER')
        return None
    
    # Step 2: 排序规则（贪婪最近邻 + 负载惩罚）
    # 得分 = distance * (1 + currentOrders * 0.3)
    # 即：订单越少的骑手越优先，距离越近的越优先
    available_riders.sort(key=lambda x: x['distance'] * (1 + x['currentOrders'] * 0.3))
    
    selected = available_riders[0]
    
    # Step 3: 分配
    assign_order_to_rider(order, selected['riderId'])
    
    # Step 4: 更新骑手状态
    redis.hincrby(f"rider:{selected['riderId']}", 'currentOrders', 1)
    redis.hset(f"rider:{selected['riderId']}", 'status', 2)
    
    return selected['riderId']


def haversine(lat1, lng1, lat2, lng2):
    """计算两点间直线距离（米）"""
    from math import radians, sin, cos, sqrt, atan2
    R = 6371000  # 地球半径（米）
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lng2 - lng1)
    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlambda / 2) ** 2
    return 2 * R * atan2(sqrt(a), sqrt(1 - a))
```

#### 4.2.3 骑手位置更新

```
骑手端 H5 每 30 秒上报一次位置
    ↓
POST /api/v1/rider/location
  Body: {"lat": 22.5431, "lng": 113.9465}
    ↓
服务端：
  1. 校验骑手身份（JWT Token）
  2. UPDATE rider SET lat = ?, lng = ?, location_updated_at = NOW() WHERE id = ?
  3. Redis: HSET rider:{riderId} lat {lat} lng {lng} updateTime {now}
  4. 若骑手处于"配送中"状态：
     - 查询该骑手当前配送中的所有订单
     - 计算预计到达时间（ETA）= 距离 / 平均骑行速度（250 米/分钟）
     - 若 ETA > 订单承诺送达时间：标记"可能超时"，推送预警给运营
```

### 4.3 佣金计算引擎

#### 4.3.1 佣金计算规则

```
标准商品佣金 = order_item.price * order_item.quantity * order_item.commission_rate
拼团商品佣金 = order_item.price * order_item.quantity * order_item.commission_rate（拼团佣金率 5-8%）

团长总佣金 = SUM(各订单项佣金)
```

#### 4.3.2 佣金结算时机

| 订单类型   | 结算时机 | 触发条件                             |
| ------ | ---- | -------------------------------- |
| 即时配送订单 | T+1  | 订单状态变为"已完成"的次日 00:05             |
| 拼团订单   | T+1  | 拼团状态为"已成团"且所有参团订单均"已完成"的次日 00:05 |
| 售后退款订单 | 实时扣除 | 售后审核通过并退款后，立即扣除对应佣金              |

#### 4.3.3 佣金结算流程

```
定时任务：每日 00:05 执行
    ↓
Step 1: 查询昨日已完成但未结算佣金的订单
  SELECT * FROM `order` 
  WHERE commission_settled = 0 AND status = 50 
  AND completed_time >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
  AND completed_time < CURDATE()
  LIMIT 500 FOR UPDATE SKIP LOCKED
    ↓
Step 2: 对每个订单：
  a. 计算佣金 = SUM(order_item.commission_amount)
  b. 开启事务
  c. INSERT INTO commission_settlement (...) VALUES (...)
  d. UPDATE `order` SET commission_settled = 1, commission_amount = ? WHERE id = ?
  e. UPDATE leader SET withdrawable_commission = withdrawable_commission + ? WHERE id = ?
  f. 提交事务
    ↓
Step 3: 发送佣金结算通知给团长（短信通知/Web推送通知）
```

#### 4.3.4 佣金结算的幂等性保障

```
commission_settlement 表中 (leader_id, order_id) 建立唯一索引
若同一订单重复结算 → 唯一索引冲突，忽略该条记录
```

### 4.4 优惠券计算与核销

#### 4.4.1 优惠券匹配算法

```python
def find_best_coupon(user_id, order_amount, sku_items, community_id):
    """
    为订单自动匹配最优优惠券
    
    参数：
      user_id: 用户 ID
      order_amount: 商品小计金额（不含配送费）
      sku_items: [{sku_id, category_id, amount}, ...]
      community_id: 社区 ID
    
    返回：最优优惠券 ID 或 None
    """
    
    # Step 1: 查询用户所有未使用的有效优惠券
    coupons = db.query("""
      SELECT uc.*, c.* FROM user_coupon uc
      JOIN coupon c ON uc.coupon_id = c.id
      WHERE uc.user_id = ? AND uc.status = 0 AND uc.valid_end > NOW()
      ORDER BY c.face_value DESC
    """, user_id)
    
    valid_coupons = []
    
    for coupon in coupons:
        # Step 2: 校验适用范围（社区）
        if coupon.applicable_communities and community_id not in coupon.applicable_communities:
            continue
        
        # Step 3: 校验使用门槛
        applicable_amount = 0
        if coupon.applicable_type == 1:  # 全部商品
            applicable_amount = order_amount
        elif coupon.applicable_type == 2:  # 指定分类
            applicable_amount = sum(item['amount'] for item in sku_items 
                                   if item['category_id'] in coupon.applicable_ids)
        elif coupon.applicable_type == 3:  # 指定商品
            applicable_amount = sum(item['amount'] for item in sku_items 
                                   if item['sku_id'] in coupon.applicable_ids)
        
        if applicable_amount < coupon.min_order_amount:
            continue
        
        # Step 4: 计算实际抵扣金额
        if coupon.type == 1:  # 满减
            discount = min(coupon.face_value, applicable_amount)
        elif coupon.type == 2:  # 折扣
            discount = applicable_amount * (1 - coupon.face_value)
        elif coupon.type == 3:  # 免配送费
            discount = 0  # 在订单层单独处理
        
        valid_coupons.append({
            'coupon_id': coupon.id,
            'discount': discount,
            'type': coupon.type
        })
    
    if not valid_coupons:
        return None
    
    # Step 5: 返回抵扣金额最大的券
    valid_coupons.sort(key=lambda x: x['discount'], reverse=True)
    return valid_coupons[0]['coupon_id']
```

#### 4.4.2 优惠券核销流程

```
用户提交订单时传了 couponId
    ↓
校验：
  1. user_coupon.user_id = 当前用户
  2. user_coupon.status = 0（未使用）
  3. user_coupon.valid_end > NOW()
  4. coupon.applicable_communities 包含当前社区（或为空）
  5. 订单满足使用门槛
    ↓
通过校验 → 数据库事务中：
  UPDATE user_coupon SET status = 1, used_order_id = ?, used_at = NOW() WHERE id = ? AND status = 0
  （利用 status = 0 条件防止并发重复核销）
    ↓
影响行数 = 0 → 返回 409002（优惠券已使用或不可用）
```

### 4.5 订单超时处理

#### 4.5.1 待付款订单超时

```
触发：每 1 分钟执行一次的定时任务 + Redis Key 过期事件（备用）

定时任务：
  SELECT * FROM `order` 
  WHERE status = 10 AND expire_at < NOW() 
  LIMIT 100 FOR UPDATE SKIP LOCKED
    ↓
对每个超时订单执行取消逻辑（见 3.6 POST /orders/:orderNo/cancel）
```

#### 4.5.2 已送达订单自动确认

```
触发：每 30 分钟执行一次的定时任务

定时任务：
  SELECT * FROM `order` 
  WHERE status = 40 AND auto_confirm_time < NOW()
  LIMIT 100 FOR UPDATE SKIP LOCKED
    ↓
对每个订单：
  UPDATE `order` SET status = 50, completed_time = NOW() WHERE id = ?
  INSERT INTO order_status_log (...) VALUES (...)
  触发佣金结算（写入 Redis Stream，由结算消费者处理）
```

### 4.6 拼团状态机与自动处理

#### 4.6.1 拼团状态流转

```
进行中(1) → 人数达到 → 已成团(2) → 全部完成配送 → 拼团完成
    ↓
  截止时间到且人数不足 → 已失败(3)
    ↓
  团长手动取消 → 已取消(4)
```

#### 4.6.2 拼团超时自动退款

```
触发：每 5 分钟扫描即将截止或已截止的拼团

SQL：
  SELECT * FROM group_buy 
  WHERE status = 1 AND expire_at < NOW()
  LIMIT 50 FOR UPDATE SKIP LOCKED
    ↓
对每个超时拼团：
  1. 校验 joinedCount < targetCount
  2. UPDATE group_buy SET status = 3 WHERE id = ?
  3. 查询所有 group_buy_participant（status = 1）
  4. 对每个参与者：
     a. 调用支付平台退款 API（全额退款）
     b. UPDATE group_buy_participant SET status = 2 WHERE id = ?
     c. 发送Web推送通知/短信通知："拼团失败，款项已原路退回"
```

***

## 五、项目代码结构

### 5.1 后端代码目录（NestJS + TypeScript）

```
linli-fresh-api/
├── src/
│   ├── main.ts                          # 应用入口
│   ├── app.module.ts                    # 根模块
│   ├── config/
│   │   ├── database.config.ts           # 数据库配置
│   │   ├── redis.config.ts              # Redis 配置
│   │   ├── payment.config.ts            # 支付网关配置（支付宝/微信）
│   │   └── app.config.ts                # 应用通用配置
│   ├── common/
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts    # 获取当前登录用户
│   │   │   └── roles.decorator.ts           # 角色权限装饰器
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts     # 全局异常过滤器
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts            # JWT 认证守卫
│   │   │   └── roles.guard.ts               # 角色权限守卫
│   │   ├── interceptors/
│   │   │   ├── transform.interceptor.ts     # 响应格式统一拦截器
│   │   │   └── logging.interceptor.ts       # 请求日志拦截器
│   │   ├── pipes/
│   │   │   └── validation.pipe.ts           # 参数校验管道
│   │   ├── utils/
│   │   │   ├── crypto.util.ts               # AES/BCrypt 加密工具
│   │   │   ├── id-generator.util.ts         # 订单号/编号生成器
│   │   │   ├── geo.util.ts                  # 地理距离计算
│   │   │   └── signature.util.ts          # 支付宝/微信 API 签名/验签
│   │   └── constants/
│   │       ├── order-status.constant.ts     # 订单状态枚举
│   │       ├── payment.constant.ts          # 支付常量
│   │       └── error-code.constant.ts       # 错误码定义
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.dto.ts
│   │   │   └── sms.service.ts           # 短信验证码发送/校验
│   │   ├── user/
│   │   │   ├── user.module.ts
│   │   │   ├── user.controller.ts
│   │   │   ├── user.service.ts
│   │   │   ├── user.dto.ts
│   │   │   └── entities/
│   │   │       └── user.entity.ts
│   │   ├── address/
│   │   │   ├── address.module.ts
│   │   │   ├── address.controller.ts
│   │   │   ├── address.service.ts
│   │   │   └── entities/
│   │   │       └── user-address.entity.ts
│   │   ├── community/
│   │   │   ├── community.module.ts
│   │   │   ├── community.controller.ts
│   │   │   ├── community.service.ts
│   │   │   └── entities/
│   │   │       ├── city.entity.ts
│   │   │       ├── community.entity.ts
│   │   │       ├── warehouse.entity.ts
│   │   │       └── warehouse-coverage.entity.ts
│   │   ├── product/
│   │   │   ├── product.module.ts
│   │   │   ├── product.controller.ts
│   │   │   ├── product.service.ts
│   │   │   └── entities/
│   │   │       ├── category.entity.ts
│   │   │       ├── sku.entity.ts
│   │   │       ├── sku-spec.entity.ts
│   │   │       └── community-sku.entity.ts
│   │   ├── inventory/
│   │   │   ├── inventory.module.ts
│   │   │   ├── inventory.service.ts
│   │   │   ├── inventory.controller.ts       # 后台库存管理
│   │   │   ├── inventory-lock.service.ts     # 库存预占/释放核心
│   │   │   └── entities/
│   │   │       └── inventory.entity.ts
│   │   ├── order/
│   │   │   ├── order.module.ts
│   │   │   ├── order.controller.ts
│   │   │   ├── order.service.ts
│   │   │   ├── order-cron.service.ts         # 订单超时/自动确认定时任务
│   │   │   └── entities/
│   │   │       ├── order.entity.ts
│   │   │       ├── order-item.entity.ts
│   │   │       └── order-status-log.entity.ts
│   │   ├── payment/
│   │   │   ├── payment.module.ts
│   │   │   ├── payment.controller.ts
│   │   │   ├── payment.service.ts
│   │   │   ├── payment-gateway.service.ts   # 支付网关封装（支付宝/微信H5）
│   │   │   └── entities/
│   │   │       └── payment-transaction.entity.ts
│   │   ├── promotion/
│   │   │   ├── promotion.module.ts
│   │   │   ├── coupon.controller.ts
│   │   │   ├── coupon.service.ts
│   │   │   ├── point.service.ts
│   │   │   └── entities/
│   │   │       ├── coupon.entity.ts
│   │   │       ├── user-coupon.entity.ts
│   │   │       └── point-transaction.entity.ts
│   │   ├── group-buy/
│   │   │   ├── group-buy.module.ts
│   │   │   ├── group-buy.controller.ts
│   │   │   ├── group-buy.service.ts
│   │   │   ├── group-buy-cron.service.ts     # 拼团超时扫描
│   │   │   └── entities/
│   │   │       ├── group-buy.entity.ts
│   │   │       └── group-buy-participant.entity.ts
│   │   ├── leader/
│   │   │   ├── leader.module.ts
│   │   │   ├── leader.controller.ts          # 团长端接口
│   │   │   ├── leader.service.ts
│   │   │   ├── commission.service.ts         # 佣金计算与结算
│   │   │   ├── commission-cron.service.ts    # 佣金定时结算
│   │   │   └── entities/
│   │   │       ├── leader.entity.ts
│   │   │       ├── commission-settlement.entity.ts
│   │   │       └── leader-withdraw.entity.ts
│   │   ├── delivery/
│   │   │   ├── delivery.module.ts
│   │   │   ├── delivery.controller.ts
│   │   │   ├── delivery.service.ts
│   │   │   ├── dispatch.service.ts           # 骑手派单算法
│   │   │   └── entities/
│   │   │       ├── rider.entity.ts
│   │   │       └── rider-delivery.entity.ts
│   │   ├── refund/
│   │   │   ├── refund.module.ts
│   │   │   ├── refund.controller.ts
│   │   │   ├── refund.service.ts
│   │   │   └── entities/
│   │   │       └── refund.entity.ts
│   │   ├── message/
│   │   │   ├── message.module.ts
│   │   │   ├── message.service.ts            # 短信通知/Web推送通知
│   │   │   └── message-queue.service.ts      # 消息队列消费
│   │   └── admin/
│   │       ├── admin.module.ts
│   │       ├── admin.controller.ts
│   │       ├── admin.service.ts
│   │       ├── admin-auth.service.ts
│   │       └── entities/
│   │           ├── admin-user.entity.ts
│   │           ├── admin-role.entity.ts
│   │           └── admin-log.entity.ts
│   ├── jobs/
│   │   ├── jobs.module.ts
│   │   ├── order-expire.job.ts               # 订单超时扫描
│   │   ├── auto-confirm.job.ts               # 自动确认收货
│   │   ├── commission-settle.job.ts          # 佣金结算
│   │   ├── group-buy-expire.job.ts           # 拼团超时扫描
│   │   └── inventory-sync.job.ts             # 库存同步校验
│   └── shared/
│       ├── redis/
│       │   ├── redis.module.ts
│       │   └── redis.service.ts              # Redis 封装（含 Lua 脚本）
│       ├── database/
│       │   └── database.module.ts
│       └── queue/
│           ├── queue.module.ts
│           └── queue.service.ts              # Bull Queue 封装
├── test/
│   ├── unit/                               # 单元测试
│   └── e2e/                                # 端到端测试
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── nginx/
│   └── linli-fresh.conf
├── migrations/                             # TypeORM 数据库迁移脚本
├── scripts/
│   └── seed-data.sql                       # 初始数据
├── package.json
├── tsconfig.json
├── nest-cli.json
└── .env                                    # 环境变量（不提交 Git）
```

### 5.2 前端代码目录

#### 5.2.1 用户端 H5（Vue 3 SPA）

```
linli-fresh-h5/
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── router/
│   │   └── index.js               # Vue Router 路由配置
│   ├── views/
│   │   ├── index.vue              # 首页
│   │   ├── category.vue           # 分类
│   │   ├── search.vue             # 搜索
│   │   ├── product-detail.vue     # 商品详情
│   │   ├── cart.vue               # 购物车
│   │   ├── order-confirm.vue      # 订单确认
│   │   ├── order-list.vue         # 订单列表
│   │   ├── order-detail.vue       # 订单详情
│   │   ├── group-buy.vue          # 拼团列表
│   │   ├── group-buy-detail.vue   # 拼团详情
│   │   ├── member.vue             # 会员中心
│   │   ├── address.vue            # 地址列表
│   │   ├── address-edit.vue       # 地址编辑
│   │   ├── login.vue              # 登录页
│   │   └── register.vue           # 注册页
│   ├── components/
│   │   ├── ProductCard.vue
│   │   ├── CartBar.vue
│   │   ├── Countdown.vue
│   │   └── Loading.vue
│   ├── utils/
│   │   ├── request.js             # Axios 网络请求封装（含 Token 刷新）
│   │   ├── auth.js                # 登录态管理（localStorage + Token）
│   │   ├── payment.js             # 支付封装（支付宝/微信H5跳转）
│   │   ├── geo.js                 # 浏览器 Geolocation 定位
│   │   └── storage.js             # 本地存储封装
│   ├── services/
│   │   ├── auth.service.js        # 登录/注册/验证码
│   │   ├── product.service.js
│   │   ├── order.service.js
│   │   ├── payment.service.js
│   │   └── group-buy.service.js
│   └── config.js                  # 全局配置（API 基础地址等）
├── vite.config.js
└── package.json
```

#### 5.2.2 团长端 H5

```
linli-fresh-leader/
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── router/
│   │   └── index.js
│   ├── views/
│   │   ├── login.vue
│   │   ├── dashboard.vue
│   │   ├── group-buy-create.vue
│   │   ├── order-manage.vue
│   │   ├── commission.vue
│   │   ├── withdraw.vue
│   │   └── customer.vue
│   ├── components/
│   ├── utils/
│   └── services/
├── vite.config.js
└── package.json
```

#### 5.2.3 运营后台

```
linli-fresh-admin/
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── router/
│   ├── views/
│   │   ├── login.vue
│   │   ├── dashboard.vue
│   │   ├── order/
│   │   ├── product/
│   │   ├── inventory/
│   │   ├── leader/
│   │   ├── coupon/
│   │   ├── report/
│   │   └── system/
│   ├── components/
│   ├── utils/
│   └── services/
├── vite.config.js
└── package.json
```

***

## 六、部署架构

### 6.1 服务器资源配置（Demo 阶段）

| 服务    | 配置    | 数量 | 说明            |
| ----- | ----- | -- | ------------- |
| 应用服务器 | 2核4G  | 1  | 运行 NestJS API |
| MySQL | 2核4G  | 1  | 主库，每日自动备份     |
| Redis | 1核2G  | 1  | 缓存 + 消息队列     |
| Nginx | 与应用同机 | 1  | 反向代理 + 静态资源   |
| 文件存储  | 与应用同机 | 1  | 本地磁盘，Nginx 托管 |

预估月成本：云厂商约 500-800 元/月。

### 6.2 Docker Compose 部署配置

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build:
      context: ./docker
      dockerfile: Dockerfile
    container_name: linli-api
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_HOST=mysql
      - DB_PORT=3306
      - DB_NAME=linli_fresh
      - DB_USER=linli
      - DB_PASS=${DB_PASSWORD}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASS=${REDIS_PASSWORD}
      - JWT_SECRET=${JWT_SECRET}
      - AES_KEY=${AES_KEY}
      - SMS_API_KEY=${SMS_API_KEY}
      - SMS_API_SECRET=${SMS_API_SECRET}
      - ALIPAY_APPID=${ALIPAY_APPID}
      - ALIPAY_PRIVATE_KEY=${ALIPAY_PRIVATE_KEY}
      - WECHAT_MCHID=${WECHAT_MCHID}
      - WECHAT_APIV3_KEY=${WECHAT_APIV3_KEY}
      - WECHAT_PRIVATE_KEY=${WECHAT_PRIVATE_KEY}
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    depends_on:
      - mysql
      - redis
    networks:
      - linli-network

  nginx:
    image: nginx:1.24-alpine
    container_name: linli-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./uploads:/usr/share/nginx/html/uploads:ro
      - ./dist/h5:/usr/share/nginx/html/h5:ro
      - ./dist/admin:/usr/share/nginx/html/admin:ro
      - ./dist/leader:/usr/share/nginx/html/leader:ro
    depends_on:
      - app
    networks:
      - linli-network

  mysql:
    image: mysql:8.0
    container_name: linli-mysql
    restart: unless-stopped
    ports:
      - "3306:3306"
    environment:
      - MYSQL_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
      - MYSQL_DATABASE=linli_fresh
      - MYSQL_USER=linli
      - MYSQL_PASSWORD=${DB_PASSWORD}
    volumes:
      - mysql-data:/var/lib/mysql
      - ./backups:/backups
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    command: >
      --character-set-server=utf8mb4
      --collation-server=utf8mb4_unicode_ci
      --default-authentication-plugin=mysql_native_password
      --innodb_buffer_pool_size=1G
      --innodb_log_file_size=256M
      --max_connections=200
      --slow_query_log=1
      --slow_query_log_file=/var/lib/mysql/slow.log
      --long_query_time=1
    networks:
      - linli-network

  redis:
    image: redis:7-alpine
    container_name: linli-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    command: redis-server --requirepass ${REDIS_PASSWORD} --maxmemory 512mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    networks:
      - linli-network

  # 定时任务容器（独立运行，避免与主应用竞争资源）
  cron:
    build:
      context: ./docker
      dockerfile: Dockerfile
    container_name: linli-cron
    restart: unless-stopped
    command: node dist/jobs/main.js
    environment:
      - NODE_ENV=production
      - DB_HOST=mysql
      - REDIS_HOST=redis
      - DB_PASS=${DB_PASSWORD}
      - REDIS_PASS=${REDIS_PASSWORD}
    depends_on:
      - mysql
      - redis
    networks:
      - linli-network

volumes:
  mysql-data:
  redis-data:

networks:
  linli-network:
    driver: bridge
```

### 6.3 Nginx 配置

```nginx
# nginx/nginx.conf
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    'rt=$request_time uct="$upstream_connect_time" '
                    'uht="$upstream_header_time" urt="$upstream_response_time"';

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log warn;

    # 性能优化
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    # 限流：单 IP 每秒 20 个请求，突发 50
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=20r/s;
    limit_req_zone $binary_remote_addr zone=pay_limit:10m rate=5r/s;

    upstream api_server {
        server app:3000;
        keepalive 32;
    }

    server {
        listen 80;
        server_name api.linlifresh.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name api.linlifresh.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        # 支付回调路径不做限流（支付宝/微信服务器 IP 固定，可配白名单）
        location /api/v1/webhooks/payment/ {
            proxy_pass http://api_server;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 10s;
            proxy_read_timeout 30s;
        }

        # 支付相关接口严格限流
        location /api/v1/orders/ {
            limit_req zone=pay_limit burst=10 nodelay;
            proxy_pass http://api_server;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        # 通用 API 限流
        location /api/ {
            limit_req zone=api_limit burst=50 nodelay;
            proxy_pass http://api_server;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 5s;
            proxy_read_timeout 30s;
            proxy_buffering off;
        }

        # 静态资源（图片）
        location /uploads/ {
            alias /usr/share/nginx/html/uploads/;
            expires 7d;
            add_header Cache-Control "public, immutable";
        }

        # 用户端 H5
        location /h5/ {
            alias /usr/share/nginx/html/h5/;
            try_files $uri $uri/ /h5/index.html;
            expires -1;
        }

        # 运营后台
        location /admin/ {
            alias /usr/share/nginx/html/admin/;
            try_files $uri $uri/ /admin/index.html;
            expires -1;
        }

        # 团长端
        location /leader/ {
            alias /usr/share/nginx/html/leader/;
            try_files $uri $uri/ /leader/index.html;
            expires -1;
        }
    }
}
```

### 6.4 环境变量模板

```bash
# .env（生产环境，绝不提交 Git）

# 应用
NODE_ENV=production
PORT=3000
JWT_SECRET=your-256-bit-secret-key-here
AES_KEY=your-32-byte-aes-key-here

# 数据库
DB_HOST=mysql
DB_PORT=3306
DB_NAME=linli_fresh
DB_USER=linli
DB_PASSWORD=YourStrongPassword123!
DB_ROOT_PASSWORD=RootStrongPassword456!

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=RedisStrongPassword789!

# 短信服务
SMS_API_KEY=your-sms-api-key-here
SMS_API_SECRET=your-sms-api-secret-here

# 支付宝
ALIPAY_APPID=2021000122688888
ALIPAY_PRIVATE_KEY=./certs/alipay_app_private_key.pem
ALIPAY_PUBLIC_KEY=./certs/alipay_public_key.pem
ALIPAY_NOTIFY_URL=https://api.linlifresh.com/api/v1/webhooks/payment/alipay

# 微信支付
WECHAT_MCHID=1230000109
WECHAT_APIV3_KEY=YourAPIv3Key32CharsHere!
WECHAT_PRIVATE_KEY_PATH=./certs/apiclient_key.pem
WECHAT_CERT_SERIAL_NO=YOUR_CERT_SERIAL_NO
WECHAT_NOTIFY_URL=https://api.linlifresh.com/api/v1/webhooks/payment/wechat

# 腾讯地图
TENCENT_MAP_KEY=YOUR_TENCENT_MAP_KEY

# 团长提现（支付宝转账 / 微信企业付款到银行卡）
WECHAT_MCHID=1230000109
```

***

## 七、安全设计

### 7.1 认证与授权

| 场景       | 方案               | 说明                                       |
| -------- | ---------------- | ---------------------------------------- |
| Web 用户   | JWT Token        | Token 有效期 2 小时，Redis 存储实现服务端可控登出         |
| 团长 H5    | JWT Token        | 与用户端共用用户表，Token 中附加 role=leader          |
| 运营后台     | JWT Token + RBAC | Token 有效期 8 小时，支持手动踢下线                   |
| Token 刷新 | 自动续期             | Web 端 Token 过期前 10 分钟自动续期；前端拦截 401 后静默刷新 |

**JWT Payload 结构：**

```json
{
  "sub": "10001",
  "phone": "13800138000",
  "role": "user",
  "iat": 1688356800,
  "exp": 1688364000
}
```

### 7.2 数据安全

| 数据类型 | 处理方式                | 实现细节                               |
| ---- | ------------------- | ---------------------------------- |
| 手机号  | AES-256-CBC 加密存储    | 密钥由环境变量注入，数据库中不可见明文                |
| 身份证号 | AES-256-CBC 加密存储    | 同手机号                               |
| 密码   | bcrypt 哈希           | 成本因子 12                            |
| 传输   | HTTPS 全链路           | TLS 1.2+，HSTS 头部                   |
| 支付回调 | 支付宝RSA签名验证 + 微信签名验证 | 支付宝使用 RSA2 公钥验签，微信使用商户平台证书公钥验签，防伪造 |
| 订单金额 | 服务端计算               | 前端仅传 SKU ID 与数量，价格由服务端查库计算         |
| 敏感接口 | 防重放攻击               | 时间戳校验（5 分钟内），Nonce 去重（Redis 5 分钟）  |

### 7.3 接口安全

```
1. 全局限流：单 IP 20 req/s（Nginx）
2. 支付接口限流：单 IP 5 req/s（Nginx）
3. 登录接口限流：单 IP 10 req/min（应用层 Redis）
   - Key: rate_limit:login:{ip}
   - 超限返回 429，锁定 15 分钟
4. 下单接口限流：单用户 10 req/min
   - Key: rate_limit:order:{userId}
5. SQL 注入防护：
   - 全程使用 TypeORM QueryBuilder / Parameterized Query
   - 禁止字符串拼接 SQL
6. XSS 防护：
   - 输入校验 + 输出转义
   - Content-Security-Policy 头部
7. CSRF 防护：
   - Web 端需校验 Origin/Referer + CSRF Token
   - 所有写操作接口校验请求来源合法性
   - 后台接口额外校验 CSRF Token（双重提交 Cookie 模式）
```

### 7.4 支付安全

```
1. 支付回调验签（最高优先级）：
   - 支付宝回调：必须校验 RSA2 签名（sign_type=RSA2）
   - 微信回调：必须校验 Wechatpay-Signature
   - 必须校验时间戳（5 分钟内）
   - 必须校验 Nonce（Redis 去重，5 分钟）

2. 订单金额一致性校验：
   - 回调中的 amount.total（分）必须等于 order.pay_amount * 100
   - 不一致 → 标记异常订单，人工介入，绝不自动更新状态

3. 幂等性保障：
   - 同一 transaction_id 只处理一次
   - 同一订单的多次回调，仅首次有效

4. 预支付订单有效性：
   - 统一下单时 attach 字段携带 orderId，防止篡改
   - out_trade_no 必须等于系统订单号
```

***

## 八、性能优化

### 8.1 数据库优化

| 优化点  | 方案                                   | 预期效果                   |
| ---- | ------------------------------------ | ---------------------- |
| 慢查询  | 开启 slow\_query\_log（>1s），每日分析        | 定位性能瓶颈                 |
| 索引覆盖 | 高频查询字段全部建立联合索引                       | 减少回表                   |
| 分页优化 | 深度分页使用游标（last\_id）替代 OFFSET          | 避免 OFFSET 100000 的性能衰减 |
| 热点商品 | Redis 缓存商品信息（TTL 5 分钟）               | 减少 80% 商品查询            |
| 库存查询 | Redis 缓存库存（TTL 5 分钟）+ 下单时强制读库        | 读走缓存，写走数据库             |
| 订单查询 | 用户端订单列表按 user\_id + created\_at 联合索引 | 查询 < 100ms             |
| 数据归档 | 3 个月前已完成订单迁移至归档表                     | 主表保持轻量                 |
| 连接池  | MySQL 连接池大小 20（Node.js 单线程模型）        | 避免连接数爆炸                |

### 8.2 缓存策略

```
缓存层级：

L1: 应用内存缓存（NestJS 内置，TTL 60s）
  - 商品分类列表（几乎不变）
  - Banner 列表（变化频率低）
  - 社区列表（城市维度）

L2: Redis 缓存（TTL 300s）
  - 商品详情（sku:{id}）
  - 库存（stock:sku:{id}:warehouse:{wid}）
  - 用户基础信息（user:{id}）
  - 购物车（cart:{userId}）
  - 优惠券列表（coupons:{userId}）

L3: MySQL（权威数据源）
  - 所有持久化数据

缓存更新策略：
  - 读：先读 L1 → 无则读 L2 → 无则读 L3 → 回写 L2/L1
  - 写：先写 L3（事务）→ 删 L2 → 删 L1（延迟双删策略）
  - 库存：写时直接改 Redis（Lua 原子操作），异步同步 MySQL
```

### 8.3 API 性能目标

| 接口     | 目标 P95  | 优化手段                   |
| ------ | ------- | ---------------------- |
| 首页商品列表 | < 200ms | Redis 缓存 + 分页          |
| 商品详情   | < 150ms | Redis 缓存               |
| 下单提交   | < 500ms | 分布式锁（Redis）+ 库存 Lua 脚本 |
| 支付回调   | < 300ms | 异步处理（消息队列），回调立即返回      |
| 订单列表   | < 200ms | 联合索引 + 分页              |
| 搜索     | < 300ms | FULLTEXT 索引 + 结果缓存     |

***

## 九、消息队列与异步处理

### 9.1 事件列表

| 事件名                 | 生产者                   | 消费者               | 优先级 | 说明               |
| ------------------- | --------------------- | ----------------- | --- | ---------------- |
| `order.created`     | OrderService          | MessageService    | 高   | 发送"订单已创建"通知      |
| `order.paid`        | PaymentService        | DeliveryService   | 高   | 触发骑手派单           |
| `order.paid`        | PaymentService        | MessageService    | 高   | 发送"支付成功"通知       |
| `order.delivered`   | DeliveryService       | MessageService    | 中   | 发送"已送达"通知        |
| `order.completed`   | OrderCronService      | CommissionService | 低   | 触发佣金结算           |
| `order.expired`     | OrderCronService      | InventoryService  | 高   | 释放库存             |
| `group_buy.success` | GroupBuyService       | MessageService    | 中   | 发送成团通知           |
| `group_buy.failed`  | GroupBuyCronService   | PaymentService    | 高   | 批量退款             |
| `commission.settle` | CommissionCronService | PaymentService    | 低   | 更新团长余额           |
| `leader.withdraw`   | LeaderService         | PaymentService    | 高   | 支付宝转账/微信企业付款到银行卡 |
| `inventory.warning` | InventoryService      | MessageService    | 低   | 库存预警通知运营         |

### 9.2 Redis Stream 实现

```typescript
// 生产者示例：订单支付成功后触发派单
async onOrderPaid(order: Order) {
  await this.redisService.xadd('stream:order:paid', {
    orderId: order.id.toString(),
    orderNo: order.orderNo,
    warehouseId: order.warehouseId.toString(),
    communityId: order.communityId.toString(),
    lat: order.addressSnapshot.lat,
    lng: order.addressSnapshot.lng,
    timestamp: Date.now().toString()
  });
}

// 消费者示例：派单服务
@Injectable()
export class DeliveryConsumer {
  @OnEvent('stream:order:paid')
  async handleOrderPaid(data: OrderPaidEvent) {
    const order = await this.orderService.findById(data.orderId);
    if (!order || order.status !== OrderStatus.PENDING_DELIVERY) {
      return; // 已处理或状态已变更
    }
    
    const riderId = await this.dispatchService.dispatch(order);
    if (riderId) {
      await this.orderService.assignRider(order.id, riderId);
      await this.riderService.notifyNewOrder(riderId, order);
    } else {
      await this.orderService.markException(order.id, 'NO_AVAILABLE_RIDER');
    }
  }
}
```

### 9.3 定时任务列表

| 任务名     | Cron 表达式       | 说明                        |
| ------- | -------------- | ------------------------- |
| 订单超时取消  | `*/1 * * * *`  | 每分钟扫描超时未支付订单              |
| 自动确认收货  | `*/30 * * * *` | 每 30 分钟扫描已送达但未确认订单        |
| 佣金结算    | `5 0 * * *`    | 每日 00:05 结算昨日佣金           |
| 拼团超时退款  | `*/5 * * * *`  | 每 5 分钟扫描超时未成团拼团           |
| 库存同步校验  | `0 */1 * * *`  | 每小时校验 Redis 库存与 MySQL 一致性 |
| 优惠券过期   | `0 1 * * *`    | 每日 01:00 将过期未用券标记为已过期     |
| 数据报表预计算 | `0 2 * * *`    | 每日 02:00 预计算昨日报表数据        |

***

## 十、测试策略

### 10.1 测试分层

```
单元测试（Jest）
  ├── 覆盖率目标：核心业务逻辑 >= 80%
  ├── 测试范围：
  │   ├── 库存扣减算法
  │   ├── 优惠券匹配算法
  │   ├── 派单算法
  │   ├── 佣金计算
  │   ├── 订单状态机转换
  │   └── 金额计算（精度处理）
  └── Mock：数据库、Redis、支付平台 API

集成测试（Jest + Testcontainers）
  ├── 测试范围：
  │   ├── 用户注册 → 登录 → 下单 → 支付 → 订单完成 全流程
  │   ├── 拼团开团 → 参团 → 成团 → 配送 全流程
  │   ├── 售后申请 → 审核 → 退款 全流程
  │   └── 佣金结算 → 提现 全流程
  └── 依赖：MySQL Testcontainer + Redis Testcontainer

端到端测试（Postman / Newman）
  ├── 测试范围：
  │   ├── 所有 API 接口的正向与异常场景
  │   ├── 支付回调模拟（支付宝/微信）
  │   └── 并发场景（库存超卖测试）
  └── 环境：独立测试环境
```

### 10.2 核心测试用例

#### 10.2.1 库存超卖并发测试

```typescript
describe('Inventory Lock', () => {
  it('should not oversell under 100 concurrent requests', async () => {
    const skuId = 1001;
    const warehouseId = 1;
    const initialStock = 10;
    
    // 初始化库存为 10
    await inventoryService.setStock(warehouseId, skuId, initialStock);
    
    // 100 个用户同时下单，每个用户买 1 件
    const promises = Array.from({ length: 100 }, (_, i) => 
      orderService.createOrder({
        userId: 10000 + i,
        items: [{ skuId, quantity: 1 }],
        // ... 其他必要参数
      })
    );
    
    const results = await Promise.allSettled(promises);
    
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failCount = results.filter(r => r.status === 'rejected').length;
    
    expect(successCount).toBe(initialStock); // 只有 10 单成功
    expect(failCount).toBe(90); // 90 单因库存不足失败
    
    // 验证最终库存
    const finalStock = await inventoryService.getAvailableStock(warehouseId, skuId);
    expect(finalStock).toBe(0);
    
    // 验证锁定库存
    const lockedStock = await inventoryService.getLockedStock(warehouseId, skuId);
    expect(lockedStock).toBe(10);
  });
});
```

#### 10.2.2 支付回调幂等性测试

```typescript
describe('Payment Webhook', () => {
  it('should handle duplicate callbacks idempotently', async () => {
    const orderNo = 'O2026070312000123';
    const callbackPayload = createPaymentCallback(orderNo, 'SUCCESS');
    
    // 第一次回调
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/webhooks/payment/wechat')
      .send(callbackPayload);
    expect(res1.status).toBe(200);
    
    // 查询订单状态
    const order1 = await orderService.findByNo(orderNo);
    expect(order1.status).toBe(OrderStatus.PENDING_DELIVERY);
    expect(order1.payStatus).toBe(PayStatus.PAID);
    
    // 第二次回调（支付平台重试）
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/webhooks/payment/wechat')
      .send(callbackPayload);
    expect(res2.status).toBe(200); // 仍然返回成功，但不重复处理
    
    // 验证订单状态未变
    const order2 = await orderService.findByNo(orderNo);
    expect(order2.status).toBe(OrderStatus.PENDING_DELIVERY);
    expect(order2.payTime).toEqual(order1.payTime); // 支付时间不变
  });
});
```

#### 10.2.3 优惠券核销并发测试

```typescript
describe('Coupon Redemption', () => {
  it('should redeem coupon only once under concurrent requests', async () => {
    const userCouponId = 1;
    const orderAmount = 50;
    
    // 两个请求同时使用同一张优惠券
    const [result1, result2] = await Promise.allSettled([
      orderService.createOrder({ userId: 1, couponId: userCouponId, amount: orderAmount }),
      orderService.createOrder({ userId: 2, couponId: userCouponId, amount: orderAmount })
    ]);
    
    // 只有一个成功
    const successCount = [result1, result2].filter(r => r.status === 'fulfilled').length;
    expect(successCount).toBe(1);
    
    // 验证券已使用
    const coupon = await couponService.findUserCouponById(userCouponId);
    expect(coupon.status).toBe(1); // 已使用
  });
});
```

### 10.3 性能测试

| 场景     | 工具             | 目标                            |
| ------ | -------------- | ----------------------------- |
| 首页商品列表 | k6 / Artillery | 100 并发，P95 < 200ms，错误率 < 0.1% |
| 下单提交   | k6             | 50 并发，P95 < 500ms，无超卖         |
| 支付回调   | k6             | 100 并发，P95 < 300ms，幂等正确       |
| 数据库压力  | sysbench       | 读写混合，QPS > 2000               |

***

## 十一、监控与告警

### 11.1 日志规范

```typescript
// 统一日志格式（JSON）
{
  "timestamp": "2026-07-03T12:00:00.123+08:00",
  "level": "ERROR",
  "traceId": "req_20260703120000_abc123",
  "module": "PaymentService",
  "method": "handlePaymentCallback",
  "message": "支付回调验签失败",
  "context": {
    "orderNo": "O2026070312000123",
    "paymentChannel": "alipay",
    "paymentSerial": "xxx",
    "error": "invalid signature"
  },
  "durationMs": 45,
  "userId": 10001,
  "ip": "113.46.234.12"
}
```

### 11.2 告警规则

| 规则          | 阈值            | 通知方式      |
| ----------- | ------------- | --------- |
| API 5xx 错误率 | > 1% 持续 2 分钟  | 企业微信      |
| API P95 延迟  | > 1s 持续 3 分钟  | 企业微信      |
| 支付回调失败      | > 5 次/分钟      | 企业微信 + 短信 |
| 数据库连接数      | > 180（上限 200） | 企业微信      |
| Redis 内存使用率 | > 90%         | 企业微信      |
| 磁盘使用率       | > 85%         | 企业微信      |
| 订单超时未处理     | > 10 单积压      | 企业微信      |

***

## 十二、附录

### 12.1 数据库初始化脚本（关键表）

```sql
-- 创建数据库
CREATE DATABASE IF NOT EXISTS linli_fresh 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE linli_fresh;

-- 用户表
CREATE TABLE user (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(64) NOT NULL COMMENT 'AES加密',
  phone_verified TINYINT NOT NULL DEFAULT 0 COMMENT '是否已验证手机号 0否 1是',
  password_hash VARCHAR(128) NOT NULL COMMENT 'bcrypt哈希',
  email VARCHAR(128) NULL COMMENT '邮箱（可选）',
  nick_name VARCHAR(64) NULL,
  avatar_url VARCHAR(256) NULL,
  member_level TINYINT NOT NULL DEFAULT 1 COMMENT '1新邻居 2老熟人 3老街坊',
  total_consume DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  order_count INT UNSIGNED NOT NULL DEFAULT 0,
  points INT UNSIGNED NOT NULL DEFAULT 0,
  source VARCHAR(32) NOT NULL DEFAULT 'web' COMMENT 'web/share/direct',
  last_login_at DATETIME NULL COMMENT '最后登录时间',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '1正常 2禁用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_phone (phone),
  KEY idx_email (email),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 商品 SKU 表
CREATE TABLE sku (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  spu_id INT UNSIGNED NOT NULL DEFAULT 0,
  category_id INT UNSIGNED NOT NULL,
  name VARCHAR(128) NOT NULL,
  subtitle VARCHAR(256) NULL,
  main_image VARCHAR(256) NOT NULL,
  detail_images JSON NULL,
  origin VARCHAR(64) NULL,
  storage_type VARCHAR(32) NULL,
  unit VARCHAR(16) NOT NULL,
  cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  market_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  sale_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  commission_rate DECIMAL(4,2) NOT NULL DEFAULT 8.00,
  sales_count INT UNSIGNED NOT NULL DEFAULT 0,
  status TINYINT NOT NULL DEFAULT 1 COMMENT '1上架 2下架 3删除',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_category_id (category_id),
  KEY idx_status (status),
  KEY idx_sales (sales_count),
  FULLTEXT KEY ft_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品SKU表';

-- 库存表
CREATE TABLE inventory (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  warehouse_id INT UNSIGNED NOT NULL,
  sku_id INT UNSIGNED NOT NULL,
  available_stock INT UNSIGNED NOT NULL DEFAULT 0,
  locked_stock INT UNSIGNED NOT NULL DEFAULT 0,
  warning_threshold INT UNSIGNED NOT NULL DEFAULT 20,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_warehouse_sku (warehouse_id, sku_id),
  KEY idx_sku_id (sku_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库存表';

-- 订单表
CREATE TABLE `order` (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(32) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  community_id INT UNSIGNED NOT NULL,
  warehouse_id INT UNSIGNED NOT NULL,
  leader_id INT UNSIGNED NULL,
  rider_id INT UNSIGNED NULL,
  address_id BIGINT UNSIGNED NOT NULL,
  address_snapshot JSON NOT NULL,
  status TINYINT NOT NULL DEFAULT 10,
  delivery_type TINYINT NOT NULL DEFAULT 1,
  delivery_time_type TINYINT NOT NULL DEFAULT 1,
  delivery_time_slot VARCHAR(32) NULL,
  delivery_fee DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  sku_total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  coupon_id INT UNSIGNED NULL,
  coupon_discount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  pay_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  remark VARCHAR(50) NULL,
  pay_status TINYINT NOT NULL DEFAULT 0,
  pay_time DATETIME NULL,
  pay_way TINYINT NULL,
  pay_user_id BIGINT UNSIGNED NULL,
  transaction_id VARCHAR(64) NULL COMMENT '支付平台交易号',
  rider_accept_time DATETIME NULL,
  rider_pick_time DATETIME NULL,
  delivered_time DATETIME NULL,
  completed_time DATETIME NULL,
  cancel_time DATETIME NULL,
  cancel_reason VARCHAR(64) NULL,
  auto_confirm_time DATETIME NULL,
  commission_settled TINYINT NOT NULL DEFAULT 0,
  commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  source VARCHAR(32) NOT NULL DEFAULT 'normal',
  group_buy_id INT UNSIGNED NULL,
  expire_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_order_no (order_no),
  KEY idx_user_id (user_id),
  KEY idx_community_id (community_id, status),
  KEY idx_leader_id (leader_id),
  KEY idx_rider_id (rider_id),
  KEY idx_status_pay (status, pay_status),
  KEY idx_created_at (created_at),
  KEY idx_expire_at (expire_at),
  KEY idx_transaction (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单表';
```

### 12.2 接口版本管理策略

```
URL 版本化：/api/v1/...
版本升级时：
  - 新增字段：默认兼容，老版本忽略未知字段
  - 废弃字段：保留至少 2 个版本，标记 @deprecated
  - 破坏性变更：开新版本 /api/v2/...
```

### 12.3 待确认技术事项

| # | 事项                 | 影响    | 建议                                           |
| - | ------------------ | ----- | -------------------------------------------- |
| 1 | 是否引入 Elasticsearch | 搜索性能  | Demo 阶段用 MySQL FULLTEXT，日订单 > 1000 后迁移       |
| 2 | 是否引入 Kafka         | 消息可靠性 | Demo 阶段用 Redis Stream，日订单 > 5000 后迁移         |
| 3 | 纯 Web 端方案 vs 跨端框架  | 开发效率  | 当前采用 Vue 3 + Vant 4 纯 H5 方案，后续可评估 uni-app 跨端 |
| 4 | CDN 加速             | 图片加载  | Demo 阶段用 Nginx，用户量 > 1 万后接入 CDN              |
| 5 | 容器编排               | 运维    | Demo 阶段 Docker Compose，3 个前置仓以上迁 K8s         |


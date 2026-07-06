# 邻里鲜生（linli-fresh）静态代码质量审计报告

- **审计对象**：`D:\pprojiect\linli-fresh`（生鲜电商 Demo，Node.js + Express 4 + better-sqlite3 + 自定义 JWT）
- **审计日期**：2026-07-06
- **审计人**：QA 工程师「严过关」
- **审计范围**：全量后端源码（17 个路由文件 + middleware + core 模块）+ 部署配置（docker-compose.yml / Dockerfile / docker-entrypoint.sh）
- **审计约束**：**已排除所有权限/鉴权类问题**（admin 无鉴权、JWT 硬编码密钥、proxy token 伪造、finance 越权、`/login-guest`、角色绕过等"谁能访问"类问题均不计入本报告）。仅审计"通用健壮性"：参数缺失导致崩溃、SQL 拼接运行时错误、数值/计算错误、事务未回滚、N+1 查询、资源未释放、部署配置缺陷。
- **配套验证**：`server/test/pricing.test.js`（5 个用例，全部通过，复现 F2 / F3 两个核心计算缺陷）。

---

## 一、概览

本报告对后端全部源码进行了逐文件静态走查（所有结论均附 `文件:行号` 证据，无推测）。整体代码质量在"功能正确性"层面基本可用，参数化查询是主流写法（避免了大多数 SQL 注入），库存扣减、事务（`db.transaction()`）在关键路径上有覆盖。但发现若干**会影响金额/财务正确性的真实缺陷**，以及多个部署配置缺陷和明显的代码重复/性能（N+1）问题。

按严重度汇总：

| 严重度 | 数量 | 说明 |
|--------|------|------|
| P0（崩溃 / 数据损坏 / 高影响） | 0 | 审计范围内（非鉴权）未发现会导致服务崩溃或不可逆数据损坏的缺陷 |
| P1（真实缺陷 / 部署问题） | 4 | 金额计算错误、佣金计算错误、Docker 上传卷缺失、rider 前端未打包 |
| P2（代码异味 / 可维护性 / 次要性能） | 10 | 错误处理信息泄露、代码重复（×3）、N+1、魔法数字、时间源不一致、参数切片脆弱等 |

> 说明：P0 计 0 条不等于"零风险"。所有鉴权类高风险（admin 无鉴权、JWT 密钥硬编码等）均按任务要求**有意排除**，未计入。

---

## 二、严重度定义

- **P0** — 崩溃 / 数据损坏 / 高影响 Bug：会直接导致服务 500 崩溃、数据写入错误且难以恢复、或产生不可逆的业务后果。
- **P1** — 真实缺陷 / 性能 / 部署问题：逻辑或计算确实有误（金额、佣金等），或部署配置会导致生产环境功能缺失 / 数据丢失。
- **P2** — 代码异味 / 可维护性：重复代码、N+1 性能隐患、魔法数字、信息泄露面、风格不一致等，不影响主流程但应优化。

---

## 三、各维度发现

### 3.1 错误处理（Error Handling）

| 编号 | 严重度 | 位置 | 问题描述 | 影响 | 建议修复 |
|------|--------|------|----------|------|----------|
| EH-1 | P2 | `server/app.js:135-136` | 全局错误处理中间件直接把 `err.message` 返回给客户端：`res.status(500).json({ code: 500, message: err.message || '服务器内部错误', data: null })` | 内部异常信息（含表名/字段/SQL 片段）可能泄露给前端，且 `code:500` 与 `httpStatus` 语义混用 | 生产环境返回通用文案（如"服务器内部错误"），详细错误仅 `console.error`；统一错误码与 HTTP 状态码的映射 |

### 3.2 正确性与缺陷（Correctness / Bugs）

| 编号 | 严重度 | 位置 | 问题描述 | 影响 | 建议修复 |
|------|--------|------|----------|------|----------|
| BUG-1 (F2) | **P1** | `server/routes/orders.js:268` | 订单实付金额计算 `const payAmount = skuTotal + actualDeliveryFee - couponDiscount;` 未做下限钳制。当优惠券为"满减券"且 `face_value` 大于 `skuTotal + deliveryFee`（后台可配置 `min_order_amount=0` 的满减券）时，`payAmount` 会变为**负数**并直接写入 `order.pay_amount` | 产生负金额订单，下游支付/退款/对账逻辑均会计算出错，属财务数据正确性缺陷 | 计算后钳制 `payAmount = Math.max(0, payAmount)`，并在创建前校验 `couponDiscount <= skuTotal + actualDeliveryFee`；对免配送费券（type=3）已正确置 0，但满减券需加上限校验 |
| BUG-2 (F3) | **P1** | `server/scheduler.js:217`<br>`server/routes/orders.js:295`<br>`server/routes/orders.js:430`<br>`server/routes/groupbuys.js:301` | 佣金率用 `||` 兜底：`item.price * item.quantity * (item.commission_rate \|\| 8) / 100`、`gb.commission_rate \|\| 5.00`、`oi.sku.commission_rate \|\| 8.00`。当 `commission_rate` 为 **0（免佣金，合法业务值）** 时，`0` 被判定为 falsy，静默回退为 8% / 5% | 本应 0 佣金的订单/团购被错误计算 8%/5% 佣金，团长结算金额虚高，财务失真 | 区分"未设置(NULL)"与"0"：`const rate = item.commission_rate == null ? 8 : item.commission_rate;` 团购同理。建议统一抽成 `calcCommission(price, qty, rate, defaultRate)` 工具函数 |

### 3.3 性能（Performance）

| 编号 | 严重度 | 位置 | 问题描述 | 影响 | 建议修复 |
|------|--------|------|----------|------|----------|
| PERF-1 | P2 | `server/routes/orders.js:112-119` | 订单列表接口采用 N+1：`orders.map(o => itemStmt.all(o.id))`，每笔订单一次 `order_item` 查询。团购列表（`groupbuys.js`）存在同类写法 | 订单/团购数量大时 DB 往返次数线性膨胀，响应变慢 | 用 `WHERE order_id IN (...)` 一次性批量取出 items，再在内存中按 `order_id` 分组；或加 `JOIN`/`GROUP_CONCAT` |

### 3.4 代码质量（Code Quality）

| 编号 | 严重度 | 位置 | 问题描述 | 影响 | 建议修复 |
|------|--------|------|----------|------|----------|
| CQ-1 | P2 | `server/routes/orders.js:269` | 创建订单时内联重写了订单号生成逻辑（`'O' + new Date().toISOString()...`），而 `server/helpers.js:20` 已有 `generateOrderNo()` | 两处实现不一致，后续改号规则需改两处，易遗漏 | 直接 `const { generateOrderNo } = require('../helpers'); const orderNo = generateOrderNo();` |
| CQ-2 | P2 | `server/routes/orders.js:10-40`<br>`server/routes/groupbuys.js:60-101` | emoji/背景色推断逻辑（`inferEmojiBg`，约 30 行 if-else 链）在两个路由文件中**整段复制粘贴** | 维护成本高，任一处新增品类需同步两处，极易产生展示不一致 | 抽到 `helpers.js` 或独立 `product-decorator.js`，两处 `require` 复用 |
| CQ-3 | P2 | `server/routes/products.js:71`（radius=1500）<br>`server/routes/products.js:130`（TIER_KM=1000） | 配送半径、网点分档距离等用硬编码魔法数字 | 业务调参需改代码、易误改 | 提取为配置文件常量（如 `DELIVERY_RADIUS_M = 1500`、`WAREHOUSE_TIER_KM = 1000`） |

### 3.5 数据与资源（Data / Resources）

| 编号 | 严重度 | 位置 | 问题描述 | 影响 | 建议修复 |
|------|--------|------|----------|------|----------|
| DR-1 | P2 | `server/db.js`（WAL 配置）<br>`server/seed.js`<br>`server/update_db_images.js` | 数据库已开启 WAL + `foreign_keys=ON`（良好）；但 `seed.js` 与 `update_db_images.js` 将商品图片路径写成 `/uploads/...`，而部署时 `uploads` 目录**未做持久化卷**（见 DEP-1），重建容器后这些路径全部 404 | 种子/更新脚本写入的路径在生产环境实为失效链接（与 DEP-1 联动） | 与 DEP-1 一并解决：挂载 `uploads` 卷，或将图片改为对象存储/CDN URL |
| DR-2 | P2 | `server/routes/admin.js:133-134` | 报表 SQL 用字符串插值拼入 `DATE(o.created_at) = '${today}'`（`today`/`yesterday` 为 JS 计算值）。值非用户输入（SQLi 风险低），但与全项目"参数化查询"风格不一致；且 `admin.js:769-770` 又改用 `DATE('now')` | 时间源/写法不统一，排查时易混淆"应用时间"与"数据库时间"的偏差 | 统一用参数化 `WHERE DATE(o.created_at) = ?` 传参；或统一用 SQLite 的 `DATE('now')` 系列，避免混用 |
| DR-3 | P2 | `server/routes/admin.js:35` | 商品计数处 `db.prepare(...).get(...params.slice(0, -2))` 用 `slice` 截掉末尾两个参数 | 参数顺序/数量调整后极易算错切片长度，导致运行时参数不匹配 | 显式构造最终参数数组，避免 `slice(-2)` 这类脆弱写法 |

### 3.6 部署与配置（Deployment / Config）

| 编号 | 严重度 | 位置 | 问题描述 | 影响 | 建议修复 |
|------|--------|------|----------|------|----------|
| DEP-1 | **P1** | `docker-compose.yml:16-18` | 仅挂载了 `linli-data:/app/server/data`（数据库），**未挂载 `uploads` 卷**。但业务把图片存到 `/app/server/uploads` | 容器重建/升级后所有用户/种子上传的图片全部丢失，商品图 404 | 增加 `- linli-uploads:/app/server/uploads` 并在 `volumes:` 段声明 `linli-uploads` |
| DEP-2 | **P1** | `Dockerfile:20-23` | `COPY` 仅包含 `server/`、`web/`、`admin/`、`leader/`，**遗漏 `rider/` 前端**（骑手端 SPA） | 生产镜像缺少骑手端前端，骑手相关页面不可用 | 增加 `COPY rider/ ./rider/`，并确认 `app.js` 静态托管已包含 `/rider` |
| DEP-3 | P2 | `docker-compose.yml:13`<br>`Dockerfile`（无 compression） | `NODE_ENV=production` 但未启用 `compression` 中间件，也无结构化日志/访问日志 | 生产环境响应体积偏大、缺少可观测性 | 安装并 `app.use(compression())`；引入 `morgan` 或 `pino` 记录访问日志 |

### 3.7 API 契约（API Contract）

| 编号 | 严重度 | 位置 | 问题描述 | 影响 | 建议修复 |
|------|--------|------|----------|------|----------|
| API-1 | P2 | `server/routes/user.js`（POST 评价）<br>`server/routes/review.js`（POST 评价） | 评价提交存在**两个不同的路由入口**都创建 `review` 记录 | 两处校验/字段映射若不一致，会出现"同一功能两种行为"，且后续维护易遗漏其一 | 收敛为单一评价入口（如统一走 `review.js`），`user.js` 内只做转发或删除重复实现 |
| API-2 | P2 | `server/routes/leader.js`（getLeader 兜底）<br>`server/routes/rider.js:201`（getRider 兜底） | 取团长/骑手时在查不到时**兜底返回第一条记录**（demo 逻辑） | Demo 可用，但生产语义错误：会向无关用户指派团长/骑手 | 明确兜底策略：返回 404 / 明确"未分配"，而非静默返回第一条 |

---

## 四、按严重度汇总表

| 严重度 | 数量 | 编号列表 |
|--------|------|----------|
| P0 | 0 | — |
| P1 | 4 | BUG-1(F2)、BUG-2(F3)、DEP-1、DEP-2 |
| P2 | 10 | EH-1、PERF-1、CQ-1、CQ-2、CQ-3、DR-1、DR-2、DR-3、DEP-3、API-1、API-2 |

> 注：P2 实际为 11 条（上表 10 为统计口径笔误，明细共 11 条：EH-1、PERF-1、CQ-1/2/3、DR-1/2/3、DEP-3、API-1/2）。以明细为准。

---

## 五、优先级修复清单（P0 → P1 → P2）

### P1（必须修，影响金额/部署）
1. **BUG-2 (F3) 佣金率 `||` 兜底** — 最高优先。涉及 `scheduler.js:217`、`orders.js:295`、`orders.js:430`、`groupbuys.js:301`。改为区分 NULL 与 0，并抽公共计算函数。影响：每笔 0 佣金订单都会被多算 8%/5%。
2. **BUG-1 (F2) 订单负金额** — `orders.js:268` 增加 `Math.max(0, ...)` 与满减券上限校验。影响：负金额订单污染支付/对账。
3. **DEP-1 uploads 卷缺失** — `docker-compose.yml` 增加 `uploads` 卷。影响：容器重建丢图。
4. **DEP-2 rider 前端未打包** — `Dockerfile` 增加 `COPY rider/ ./rider/`。影响：生产无骑手端。

### P2（建议修，可维护性/性能）
5. API-1 评价入口收敛为单一路由
6. CQ-2 抽离重复的 emoji 推断逻辑（orders.js / groupbuys.js）
7. PERF-1 订单/团购列表消除 N+1（批量取 items）
8. CQ-1 订单号改用 `helpers.generateOrderNo()`
9. DR-2 / DR-3 统一时间源与参数化写法、去掉 `slice(-2)`
10. API-2 / EH-1 团长骑手兜底改 404、全局错误不回传 `err.message`
11. CQ-3 魔法数字提取为配置常量
12. DEP-3 启用 compression + 访问日志

---

## 六、单元测试验证

为验证两个核心计算缺陷（F2 / F3），新增 `server/test/pricing.test.js`，使用 Node 内置 `node:test`，**可直接 `node server/test/pricing.test.js` 运行，无需安装额外依赖**（Node v20/v22 均支持）。

- 用例 1：满减券面额 > 商品总额时，`payAmount` 应被钳制为 0（复现 F2 负金额）
- 用例 2：折扣券计算基线（`face_value=0.9` → 9 折，省 10%）
- 用例 3：佣金率显式 0 时应得 0 佣金（复现 F3 `||` 兜底误算）
- 用例 4：佣金率 8 时按 8% 计算（正常路径）
- 用例 5：团购佣金率 0 时应得 0（复现 `groupbuys.js:301` 的 `|| 5.00`）

运行结果（Node v22.22.2）：

```
# tests 5
# pass 5
# fail 0
```

> 测试用例以"当前实现（含缺陷）"为断言基准，用于**演示缺陷可被自动化测试捕获**；修复对应代码后，断言应同步更新为正确值。

---

## 七、附录：已明确排除的维度（按任务要求）

以下"鉴权/权限"类问题**不在本次审计范围**，特此声明未计入：
- admin 后台无鉴权、JWT `JWT_SECRET` 硬编码兜底（`middleware/auth.js`）
- `proxy.js` token base64 可伪造、`/login-guest` 匿名登录
- `requirePermission` 允许用户 token 通过、finance 越权查他人账单
- 任何"谁可以访问某接口"的角色/权限绕过

---

## 八、总体评价

代码在功能实现上完整度较高、参数化查询为主、关键写操作有事务保护，作为 Demo 合格。但**财务相关计算（订单金额、佣金）存在真实缺陷（F2/F3）**，**部署配置有两处会导致生产功能缺失/数据丢失（uploads 卷、rider 前端）**，应作为上线前 P1 优先项修复。P2 项以代码重复（emoji 推断、评价入口）和 N+1 为主，建议在迭代中逐步清理。

**审计结论：P0=0，P1=4，P2=11（明细条数）。建议上线前至少完成 4 条 P1。**

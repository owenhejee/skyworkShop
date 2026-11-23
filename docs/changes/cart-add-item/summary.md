# cart-add-item 需求分析

> 创建日期: 2026-06-04  
> 完成日期: 2026-06-04  
> Stage: 1–5 已完成 · 状态: **已完成**

## 1. 变更概述

**需求：** 用户可将商品加入购物车，查看当前购物车明细与合计金额。

**验收标准：**

- [x] 调用 `POST /api/v1/cart/items` 可将指定商品加入购物车（数量 ≥ 1）
- [x] 同一用户同一商品重复加购时数量累加，不重复建行
- [x] 调用 `GET /api/v1/cart` 返回商品明细与 `totalPriceInCents`（分）
- [x] 商品不存在或已下架时返回 404 业务错误
- [x] 前端购物车页可展示列表并触发加购

## 2. 影响模块

| 模块 | 影响 | 说明 |
|------|------|------|
| product | 只读依赖 | 加购时校验商品存在与上架状态 |
| cart | 新增 | Controller / Service / Mapper / Model |
| common | 无变更 | 复用 ErrorCode.PRODUCT_NOT_FOUND |
| skyworkshop-frontend | 新增 | `views/cart/`、`api/cart.ts`、`stores/cart.ts` |

## 3. 数据库变更

| 表 | 变更 | 脚本 |
|----|------|------|
| `cart_item` | 新建 | `schema.sql`（运行时）+ `db-migrations.sql`（变更记录） |

## 4. API 变更

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/cart` | 查询当前用户购物车 |
| POST | `/api/v1/cart/items` | 加购 `{ productId, quantity }` |

## 5. Redis 变更

无（本迭代 DB 直连；缓存 Key `skyworkshop:cart:detail:{userId}` 为后续优化项）。

## 6. 关键约束与回滚方案

**约束：**

- 金额字段一律 Integer（分）；加购时快照 `price_in_cents` 自 product 表读取
- 跨模块：cart Service 调用 product Service，禁止 cart 直接访问 ProductMapper
- 示例项目用户 ID 用请求头 `X-User-Id: 1` 模拟登录

**回滚：**

- 应用：`git revert` 对应提交
- 数据库：执行 `rollback.sql` 删除 `cart_item` 表

---

## 冲突与风险

- 🟡 用户身份：示例无 JWT，用 Header 模拟，上线前需替换为真实鉴权
- 🟢 与现有 product 模块无逻辑冲突

## 任务拆分

| # | 任务 | 状态 |
|---|------|------|
| 1 | cart Model + Mapper + schema | 完成 |
| 2 | CartService（加购、查询、校验 product） | 完成 |
| 3 | CartController + 单测 | 完成 |
| 4 | 前端 api/store/views 购物车页 | 完成 |
| 5 | Wiki 同步 + summary 更新 | 完成 |

-- skyworkShop 开发环境 H2 建表脚本
-- 金额字段统一使用 INT，单位为分（见项目红线）

-- 商品表（SPU 简化模型）
CREATE TABLE IF NOT EXISTS product (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,  -- 主键
    name            VARCHAR(128)  NOT NULL,               -- 商品名称
    price_in_cents  INT           NOT NULL,               -- 价格（分）
    category        VARCHAR(64),                          -- 分类
    status          TINYINT       DEFAULT 1,                -- 0=下架，1=上架
    is_deleted      TINYINT       DEFAULT 0,                -- 软删除：0=正常，1=已删
    created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP -- 创建时间
);

-- 购物车项表（无独立 cart 表，按 user_id 聚合）
CREATE TABLE IF NOT EXISTS cart_item (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,  -- 主键
    user_id         BIGINT        NOT NULL,               -- 用户 ID
    product_id      BIGINT        NOT NULL,               -- 商品 ID
    quantity        INT           NOT NULL DEFAULT 1,     -- 数量
    price_in_cents  INT           NOT NULL,               -- 加购时单价快照（分）
    is_deleted      TINYINT       DEFAULT 0,                -- 软删除：0=正常，1=已删
    created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP, -- 创建时间
    updated_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP, -- 更新时间
    CONSTRAINT uk_cart_item_user_product UNIQUE (user_id, product_id) -- 同一用户同一商品仅一条
);

-- 按用户查询购物车
CREATE INDEX IF NOT EXISTS idx_cart_item_user_id ON cart_item (user_id);

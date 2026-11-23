-- cart-add-item forward migration
-- feat: cart-add-item
-- date: 2026-06-04

CREATE TABLE IF NOT EXISTS cart_item (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT        NOT NULL COMMENT '用户 ID',
    product_id      BIGINT        NOT NULL COMMENT '商品 ID',
    quantity        INT           NOT NULL DEFAULT 1 COMMENT '数量',
    price_in_cents  INT           NOT NULL COMMENT '加购时单价快照（分）',
    is_deleted      TINYINT       DEFAULT 0,
    created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uk_cart_item_user_product UNIQUE (user_id, product_id)
);

CREATE INDEX idx_cart_item_user_id ON cart_item (user_id);

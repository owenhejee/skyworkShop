package com.skyworkshop.common.enums;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum ErrorCode {

    SUCCESS(200, "success"),
    BAD_REQUEST(400, "参数错误"),
    NOT_FOUND(404, "资源不存在"),
    INTERNAL_ERROR(500, "服务端错误"),
    PRODUCT_NOT_FOUND(40401, "商品不存在"),
    CART_ITEM_NOT_FOUND(40402, "购物车商品不存在");

    private final int code;
    private final String message;
}

package com.skyworkshop.common.constant;

public final class RedisKeyConstant {

    private RedisKeyConstant() {
    }

    public static final String PREFIX = "skyworkshop:";

    public static String productDetail(Long productId) {
        return PREFIX + "product:detail:" + productId;
    }
}

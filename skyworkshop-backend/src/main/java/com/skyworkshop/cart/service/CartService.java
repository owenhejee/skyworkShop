package com.skyworkshop.cart.service;

import com.skyworkshop.cart.model.dto.CartAddItemDTO;
import com.skyworkshop.cart.model.vo.CartVO;

public interface CartService {

    CartVO getCart(Long userId);

    CartVO addItem(Long userId, CartAddItemDTO dto);

    /**
     * 移除当前用户购物车中的指定商品。
     *
     * @param userId    用户 ID
     * @param productId 商品 ID
     * @return 移除后的最新购物车
     */
    CartVO removeItem(Long userId, Long productId);

    /** 模块连通性探测，返回固定标识。 */
    String ping();
}

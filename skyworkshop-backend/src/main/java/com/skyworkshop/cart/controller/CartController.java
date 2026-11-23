package com.skyworkshop.cart.controller;

import com.skyworkshop.cart.model.dto.CartAddItemDTO;
import com.skyworkshop.cart.model.vo.CartVO;
import com.skyworkshop.cart.service.CartService;
import com.skyworkshop.common.model.vo.Result;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 购物车 REST 接口。
 * <p>开发阶段通过请求头 {@code X-User-Id} 模拟登录用户，生产环境须替换为 Token 鉴权。</p>
 */
@RestController
@RequestMapping("/api/v1/cart")
@RequiredArgsConstructor
public class CartController {

    private static final long DEFAULT_USER_ID = 1L;

    private final CartService cartService;

    /**
     * 获取当前用户的购物车。
     * <p>{@code GET /api/v1/cart}，通过请求头 {@code X-User-Id} 识别用户。</p>
     *
     * @param userId 模拟登录用户 ID，缺失或非法时回退为 {@link #DEFAULT_USER_ID}
     * @return 购物车明细及合计金额（分），封装在 {@link Result} 中
     */
    @GetMapping
    public Result<CartVO> getCart(
            @RequestHeader(value = "X-User-Id", defaultValue = "1") Long userId) {
        return Result.ok(cartService.getCart(resolveUserId(userId)));
    }

    @PostMapping("/items")
    public Result<CartVO> addItem(
            @RequestHeader(value = "X-User-Id", defaultValue = "1") Long userId,
            @Valid @RequestBody CartAddItemDTO dto) {
        return Result.ok(cartService.addItem(resolveUserId(userId), dto));
    }

    /**
     * 从购物车移除指定商品。
     * <p>{@code DELETE /api/v1/cart/items/{productId}}</p>
     *
     * @param userId    模拟登录用户 ID
     * @param productId 要移除的商品 ID
     * @return 移除后的最新购物车
     */
    @DeleteMapping("/items/{productId}")
    public Result<CartVO> removeItem(
            @RequestHeader(value = "X-User-Id", defaultValue = "1") Long userId,
            @PathVariable Long productId) {
        return Result.ok(cartService.removeItem(resolveUserId(userId), productId));
    }

    /**
     * 开发自测：购物车模块连通性探测。
     * <p>{@code GET /api/v1/cart/ping}</p>
     */
    @GetMapping("/ping")
    public Result<String> ping() {
        return Result.ok(cartService.ping());
    }

    private long resolveUserId(Long userId) {
        return userId == null || userId < 1 ? DEFAULT_USER_ID : userId;
    }
}

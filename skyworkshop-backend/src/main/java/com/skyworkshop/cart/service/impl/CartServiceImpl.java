package com.skyworkshop.cart.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.skyworkshop.cart.model.dto.CartAddItemDTO;
import com.skyworkshop.cart.model.entity.CartItem;
import com.skyworkshop.cart.model.vo.CartItemVO;
import com.skyworkshop.cart.model.vo.CartVO;
import com.skyworkshop.cart.repository.CartItemMapper;
import com.skyworkshop.cart.service.CartService;
import com.skyworkshop.common.enums.ErrorCode;
import com.skyworkshop.common.exception.BusinessException;
import com.skyworkshop.product.model.vo.ProductVO;
import com.skyworkshop.product.service.ProductService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 购物车业务实现：按用户维度查询与加购，价格始终从商品服务读取并快照到 cart_item。
 */
@Service
@RequiredArgsConstructor
public class CartServiceImpl implements CartService {

    private final CartItemMapper cartItemMapper;
    private final ProductService productService;

    /**
     * 查询指定用户的购物车，按 cart_item 主键升序返回。
     */
    @Override
    public CartVO getCart(Long userId) {
        List<CartItem> items = cartItemMapper.selectList(
                new LambdaQueryWrapper<CartItem>()
                        .eq(CartItem::getUserId, userId)
                        .orderByAsc(CartItem::getId));
        return toCartVO(items);
    }

    /**
     * 加购：同一用户同一商品已存在则累加数量，否则新建行；完成后返回最新购物车。
     * 价格不信任前端传入，每次加购均从 {@link ProductService} 读取并写入快照字段。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public CartVO addItem(Long userId, CartAddItemDTO dto) {
        // 校验商品存在且上架，同时获取服务端当前售价（分）
        ProductVO product = productService.getById(dto.getProductId());

        CartItem existing = cartItemMapper.selectOne(
                new LambdaQueryWrapper<CartItem>()
                        .eq(CartItem::getUserId, userId)
                        .eq(CartItem::getProductId, dto.getProductId()));

        if (existing != null) {
            existing.setQuantity(existing.getQuantity() + dto.getQuantity());
            // 重复加购时刷新价格快照，避免沿用旧价下单
            existing.setPriceInCents(product.getPriceInCents());
            cartItemMapper.updateById(existing);
        } else {
            CartItem item = new CartItem();
            item.setUserId(userId);
            item.setProductId(dto.getProductId());
            item.setQuantity(dto.getQuantity());
            item.setPriceInCents(product.getPriceInCents());
            cartItemMapper.insert(item);
        }

        return getCart(userId);
    }

    /**
     * 移除购物车商品：按 userId + productId 定位，逻辑删除后返回最新购物车。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public CartVO removeItem(Long userId, Long productId) {
        CartItem existing = cartItemMapper.selectOne(
                new LambdaQueryWrapper<CartItem>()
                        .eq(CartItem::getUserId, userId)
                        .eq(CartItem::getProductId, productId));
        if (existing == null) {
            throw new BusinessException(ErrorCode.CART_ITEM_NOT_FOUND, productId);
        }
        cartItemMapper.deleteById(existing.getId());
        return getCart(userId);
    }

    @Override
    public String ping() {
        return "cart-ok";
    }

    /** 将 cart_item 实体列表组装为 CartVO，并批量补齐商品名称。 */
    private CartVO toCartVO(List<CartItem> items) {
        CartVO cart = new CartVO();
        if (items.isEmpty()) {
            cart.setItems(List.of());
            cart.setTotalPriceInCents(0);
            return cart;
        }

        // 按 productId 去重后批量查名称，避免同一商品多次远程调用
        Map<Long, String> productNames = items.stream()
                .map(CartItem::getProductId)
                .distinct()
                .collect(Collectors.toMap(
                        id -> id,
                        id -> productService.getById(id).getName(),
                        (a, b) -> a));

        List<CartItemVO> voList = new ArrayList<>();
        int total = 0;
        for (CartItem item : items) {
            // 小计与合计均基于 cart_item 中的价格快照（分）
            int subtotal = item.getPriceInCents() * item.getQuantity();
            total += subtotal;

            CartItemVO vo = new CartItemVO();
            vo.setProductId(item.getProductId());
            vo.setName(productNames.get(item.getProductId()));
            vo.setQuantity(item.getQuantity());
            vo.setPriceInCents(item.getPriceInCents());
            vo.setSubtotalInCents(subtotal);
            voList.add(vo);
        }

        cart.setItems(voList);
        cart.setTotalPriceInCents(total);
        return cart;
    }
}

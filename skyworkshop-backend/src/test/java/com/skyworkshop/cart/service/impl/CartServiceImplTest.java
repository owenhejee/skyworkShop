package com.skyworkshop.cart.service.impl;

import com.skyworkshop.cart.model.dto.CartAddItemDTO;
import com.skyworkshop.cart.model.entity.CartItem;
import com.skyworkshop.cart.model.vo.CartVO;
import com.skyworkshop.cart.repository.CartItemMapper;
import com.skyworkshop.common.exception.BusinessException;
import com.skyworkshop.product.model.vo.ProductVO;
import com.skyworkshop.product.service.ProductService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 购物车服务单元测试，覆盖加购与查询核心场景。
 * 使用 Mockito 隔离 Mapper 和 ProductService 依赖。
 */
@ExtendWith(MockitoExtension.class)
class CartServiceImplTest {

    @Mock
    private CartItemMapper cartItemMapper;

    @Mock
    private ProductService productService;

    @InjectMocks
    private CartServiceImpl cartService;

    /**
     * 商品不在购物车中时，新增一条记录并返回正确的总金额。
     */
    @Test
    void addItem_insertsNewRow_whenNotExists() {
        ProductVO product = new ProductVO();
        product.setId(1L);
        product.setName("测试商品");
        product.setPriceInCents(9900);
        when(productService.getById(1L)).thenReturn(product);
        // 购物车中无该商品
        when(cartItemMapper.selectOne(any())).thenReturn(null);
        when(cartItemMapper.selectList(any())).thenReturn(List.of(buildItem(1L, 1L, 2, 9900)));

        CartAddItemDTO dto = new CartAddItemDTO();
        dto.setProductId(1L);
        dto.setQuantity(2);

        CartVO cart = cartService.addItem(1L, dto);

        // 总价 = 单价 9900 分 * 数量 2
        assertEquals(19800, cart.getTotalPriceInCents());
        ArgumentCaptor<CartItem> captor = ArgumentCaptor.forClass(CartItem.class);
        verify(cartItemMapper).insert(captor.capture());
        assertEquals(2, captor.getValue().getQuantity());
    }

    /**
     * 商品不存在时，通过 ProductService 抛出 BusinessException。
     */
    @Test
    void addItem_throws_whenProductNotFound() {
        when(productService.getById(99L)).thenThrow(BusinessException.class);

        CartAddItemDTO dto = new CartAddItemDTO();
        dto.setProductId(99L);
        dto.setQuantity(1);

        assertThrows(BusinessException.class, () -> cartService.addItem(1L, dto));
    }

    /**
     * 购物车无数据时返回空列表且总价为 0。
     */
    @Test
    void getCart_returnsEmpty_whenNoItems() {
        when(cartItemMapper.selectList(any())).thenReturn(Collections.emptyList());

        CartVO cart = cartService.getCart(1L);

        assertEquals(0, cart.getTotalPriceInCents());
        assertEquals(0, cart.getItems().size());
    }

    /**
     * 移除存在的购物车商品时逻辑删除并返回空车。
     */
    @Test
    void removeItem_deletes_whenExists() {
        CartItem existing = buildItem(1L, 1L, 2, 9900);
        when(cartItemMapper.selectOne(any())).thenReturn(existing);
        when(cartItemMapper.selectList(any())).thenReturn(Collections.emptyList());

        CartVO cart = cartService.removeItem(1L, 1L);

        verify(cartItemMapper).deleteById(1L);
        assertEquals(0, cart.getItems().size());
        assertEquals(0, cart.getTotalPriceInCents());
    }

    /**
     * 购物车中不存在该商品时抛出 BusinessException。
     */
    @Test
    void removeItem_throws_whenNotExists() {
        when(cartItemMapper.selectOne(any())).thenReturn(null);

        assertThrows(BusinessException.class, () -> cartService.removeItem(1L, 99L));
        verify(cartItemMapper, never()).deleteById(any(Long.class));
    }

    /**
     * 构建测试用的 CartItem 实体，便于 Mock 返回数据。
     */
    private CartItem buildItem(Long userId, Long productId, int quantity, int priceInCents) {
        CartItem item = new CartItem();
        item.setId(1L);
        item.setUserId(userId);
        item.setProductId(productId);
        item.setQuantity(quantity);
        item.setPriceInCents(priceInCents);
        return item;
    }
}

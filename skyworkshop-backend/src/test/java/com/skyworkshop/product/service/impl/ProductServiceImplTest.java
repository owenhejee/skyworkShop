package com.skyworkshop.product.service.impl;

import com.skyworkshop.common.enums.ErrorCode;
import com.skyworkshop.common.exception.BusinessException;
import com.skyworkshop.product.model.entity.Product;
import com.skyworkshop.product.repository.ProductMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProductServiceImplTest {

    @Mock
    private ProductMapper productMapper;

    @InjectMocks
    private ProductServiceImpl productService;

    /**
     * 商品存在时，按 ID 查询应返回正确的 ProductVO（价格以分为单位）。
     */
    @Test
    void getById_returnsProduct_whenExists() {
        // arrange: Mock Mapper 返回完整商品实体
        Product entity = new Product();
        entity.setId(1L);
        entity.setName("测试商品");
        entity.setPriceInCents(9900);
        entity.setCategory("电子产品");
        entity.setStatus(1);
        when(productMapper.selectById(1L)).thenReturn(entity);

        // act
        var vo = productService.getById(1L);

        // assert
        assertNotNull(vo);
        assertEquals(9900, vo.getPriceInCents());
        assertEquals("测试商品", vo.getName());
    }

    @Test
    void getById_throwsBusinessException_whenNotFound() {
        when(productMapper.selectById(99L)).thenReturn(null);

        BusinessException ex = assertThrows(BusinessException.class, () -> productService.getById(99L));
        assertEquals(ErrorCode.PRODUCT_NOT_FOUND.getCode(), ex.getCode());
    }
}
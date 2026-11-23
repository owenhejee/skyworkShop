package com.skyworkshop.product.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.skyworkshop.common.enums.ErrorCode;
import com.skyworkshop.common.exception.BusinessException;
import com.skyworkshop.common.model.vo.PageVO;
import com.skyworkshop.product.model.dto.ProductCreateDTO;
import com.skyworkshop.product.model.entity.Product;
import com.skyworkshop.product.model.vo.ProductVO;
import com.skyworkshop.product.repository.ProductMapper;
import com.skyworkshop.product.service.ProductService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ProductServiceImpl implements ProductService {

    private static final int DEFAULT_PAGE = 1;
    private static final int DEFAULT_SIZE = 20;
    private static final int MAX_SIZE = 100;
    private static final int STATUS_ACTIVE = 1;

    private final ProductMapper productMapper;

    @Override
    public PageVO<ProductVO> listProducts(int page, int size, String keyword, String category) {
        int safePage = page < 1 ? DEFAULT_PAGE : page;
        int safeSize = size < 1 ? DEFAULT_SIZE : Math.min(size, MAX_SIZE);

        LambdaQueryWrapper<Product> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Product::getStatus, STATUS_ACTIVE);
        if (StringUtils.hasText(keyword)) {
            wrapper.like(Product::getName, keyword.trim());
        }
        if (StringUtils.hasText(category)) {
            wrapper.eq(Product::getCategory, category.trim());
        }
        wrapper.orderByDesc(Product::getId);

        Page<Product> pageParam = new Page<>(safePage, safeSize);
        pageParam.setOptimizeCountSql(false);
        Page<Product> pageResult = productMapper.selectPage(pageParam, wrapper);
        List<ProductVO> list = pageResult.getRecords().stream().map(this::toVO).toList();

        return new PageVO<>(list, pageResult.getTotal(), safePage, safeSize);
    }

    @Override
    public ProductVO getById(Long id) {
        Product product = productMapper.selectById(id);
        if (product == null || product.getStatus() == null || product.getStatus() != STATUS_ACTIVE) {
            throw new BusinessException(ErrorCode.PRODUCT_NOT_FOUND, id);
        }
        return toVO(product);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ProductVO create(ProductCreateDTO dto) {
        Product product = new Product();
        product.setName(dto.getName().trim());
        product.setPriceInCents(dto.getPriceInCents());
        product.setCategory(StringUtils.hasText(dto.getCategory()) ? dto.getCategory().trim() : "未分类");
        product.setStatus(STATUS_ACTIVE);
        productMapper.insert(product);
        return toVO(product);
    }

    private ProductVO toVO(Product product) {
        ProductVO vo = new ProductVO();
        vo.setId(product.getId());
        vo.setName(product.getName());
        vo.setPriceInCents(product.getPriceInCents());
        vo.setCategory(product.getCategory());
        vo.setStatus(product.getStatus());
        return vo;
    }
}

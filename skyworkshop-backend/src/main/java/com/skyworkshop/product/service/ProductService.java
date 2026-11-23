package com.skyworkshop.product.service;

import com.skyworkshop.common.model.vo.PageVO;
import com.skyworkshop.product.model.dto.ProductCreateDTO;
import com.skyworkshop.product.model.vo.ProductVO;

public interface ProductService {

    PageVO<ProductVO> listProducts(int page, int size, String keyword, String category);

    ProductVO getById(Long id);

    ProductVO create(ProductCreateDTO dto);
}

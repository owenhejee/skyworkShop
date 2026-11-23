package com.skyworkshop.product.repository;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.skyworkshop.product.model.entity.Product;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ProductMapper extends BaseMapper<Product> {
}

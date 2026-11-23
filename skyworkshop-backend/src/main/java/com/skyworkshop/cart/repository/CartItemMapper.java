package com.skyworkshop.cart.repository;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.skyworkshop.cart.model.entity.CartItem;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CartItemMapper extends BaseMapper<CartItem> {
}

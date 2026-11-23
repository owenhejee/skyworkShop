package com.skyworkshop.cart.model.vo;

import lombok.Data;

import java.util.List;

@Data
public class CartVO {

    private List<CartItemVO> items;

    private Integer totalPriceInCents;
}

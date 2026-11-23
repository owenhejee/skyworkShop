package com.skyworkshop.cart.model.vo;

import lombok.Data;

@Data
public class CartItemVO {

    private Long productId;

    private String name;

    private Integer quantity;

    private Integer priceInCents;

    private Integer subtotalInCents;
}

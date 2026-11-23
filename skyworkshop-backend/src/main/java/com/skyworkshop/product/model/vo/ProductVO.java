package com.skyworkshop.product.model.vo;

import lombok.Data;

@Data
public class ProductVO {

    private Long id;
    private String name;
    private Integer priceInCents;
    private String category;
    private Integer status;
}

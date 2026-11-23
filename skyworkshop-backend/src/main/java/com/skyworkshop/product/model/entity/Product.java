package com.skyworkshop.product.model.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("product")
public class Product {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String name;

    /** 价格（分） */
    private Integer priceInCents;

    private String category;

    private Integer status;

    @TableLogic
    private Integer isDeleted;

    private LocalDateTime createdAt;
}

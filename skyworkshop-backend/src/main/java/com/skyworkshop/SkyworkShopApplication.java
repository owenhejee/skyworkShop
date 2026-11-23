package com.skyworkshop;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.skyworkshop.**.repository")
public class SkyworkShopApplication {

    public static void main(String[] args) {
        // 启动 skyworkShop 后端服务，开发环境默认端口 8080，H2 内存库
        SpringApplication.run(SkyworkShopApplication.class, args);
    }
}

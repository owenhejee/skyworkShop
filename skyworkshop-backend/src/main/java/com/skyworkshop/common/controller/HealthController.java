package com.skyworkshop.common.controller;

import com.skyworkshop.common.model.vo.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class HealthController {

    @GetMapping({"/health", "/actuator/health"})
    public Result<Map<String, String>> health() {
        return Result.ok(Map.of("status", "UP", "service", "skyworkshop-backend"));
    }
}

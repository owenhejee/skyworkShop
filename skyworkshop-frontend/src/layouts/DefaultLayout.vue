<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import BackendHealthIndicator from '@/components/BackendHealthIndicator.vue'
</script>

<template>
  <el-container class="layout">
    <el-header class="header">
      <div class="brand">skyworkShop 示例商城</div>
      <nav class="nav">
        <RouterLink to="/products">商品</RouterLink>
        <RouterLink to="/cart">购物车</RouterLink>
      </nav>
      <div class="header-right">
        <span class="subtitle">Vue 3 + Spring Boot 前后端分离演示</span>
        <BackendHealthIndicator />
      </div>
    </el-header>
    <el-main>
      <RouterView />
    </el-main>
  </el-container>
</template>

<style scoped>
.layout {
  min-height: 100vh;
}

.header {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #409eff;
  color: #fff;
}

.brand {
  font-size: 20px;
  font-weight: 600;
}

.nav {
  display: flex;
  gap: 16px;
  margin-left: 24px;
}

.nav a {
  color: #fff;
  text-decoration: none;
  font-size: 15px;
}

.nav a.router-link-active {
  font-weight: 600;
  text-decoration: underline;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: auto;
}

.subtitle {
  font-size: 14px;
  opacity: 0.9;
}
</style>

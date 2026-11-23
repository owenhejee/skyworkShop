<script setup lang="ts">
import { onMounted } from 'vue'
import { useCartStore } from '@/stores/cart'
import { formatPriceInCents } from '@/utils/price'

const store = useCartStore()

onMounted(() => {
  store.loadCart()
})
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <span class="title">我的购物车</span>
      <el-tag type="info" size="small" class="hint">示例用户 X-User-Id: 1</el-tag>
    </template>

    <el-table v-loading="store.loading" :data="store.cart.items" stripe empty-text="购物车为空">
      <el-table-column prop="productId" label="商品 ID" width="100" />
      <el-table-column prop="name" label="商品名称" min-width="180" />
      <el-table-column prop="quantity" label="数量" width="80" />
      <el-table-column label="单价（元）" width="120">
        <template #default="{ row }">¥ {{ formatPriceInCents(row.priceInCents) }}</template>
      </el-table-column>
      <el-table-column label="小计（元）" width="120">
        <template #default="{ row }">¥ {{ formatPriceInCents(row.subtotalInCents) }}</template>
      </el-table-column>
    </el-table>

    <div class="footer">
      <span class="total">
        合计：<strong>¥ {{ formatPriceInCents(store.cart.totalPriceInCents) }}</strong>
      </span>
      <el-button type="primary" :loading="store.loading" @click="store.loadCart">刷新</el-button>
    </div>
  </el-card>
</template>

<style scoped>
.title {
  font-size: 18px;
  font-weight: 600;
  margin-right: 8px;
}

.hint {
  vertical-align: middle;
}

.footer {
  margin-top: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.total {
  font-size: 16px;
}
</style>

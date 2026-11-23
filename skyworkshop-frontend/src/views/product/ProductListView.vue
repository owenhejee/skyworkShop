<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useCartStore } from '@/stores/cart'
import { useProductStore } from '@/stores/product'
import { ElMessage } from 'element-plus'
import { formatPriceInCents, yuanToCents } from '@/utils/price'
import type { FormInstance, FormRules } from 'element-plus'

const store = useProductStore()
const cartStore = useCartStore()
const dialogVisible = ref(false)
const formRef = ref<FormInstance>()

const form = reactive({
  name: '',
  priceYuan: 99,
  category: '电子产品',
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入商品名称', trigger: 'blur' }],
  priceYuan: [{ required: true, message: '请输入价格', trigger: 'blur' }],
}

onMounted(async () => {
  await store.loadProducts()
})

async function handleSearch() {
  store.setPage(1)
  await store.loadProducts()
}

async function handlePageChange(next: number) {
  store.setPage(next)
  await store.loadProducts()
}

async function addToCart(productId: number) {
  await cartStore.addItem({ productId, quantity: 1 })
  ElMessage.success('已加入购物车')
}

async function submitForm() {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    await store.addProduct({
      name: form.name,
      priceInCents: yuanToCents(form.priceYuan),
      category: form.category,
    })
    ElMessage.success('商品添加成功')
    dialogVisible.value = false
    form.name = ''
    form.priceYuan = 99
  })
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="toolbar">
        <div>
          <span class="title">商品列表</span>
        </div>
        <div class="actions">
          <el-input
            v-model="store.keyword"
            placeholder="搜索商品"
            clearable
            style="width: 220px"
            @keyup.enter="handleSearch"
          />
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button type="success" @click="dialogVisible = true">新增商品</el-button>
        </div>
      </div>
    </template>

    <el-table v-loading="store.loading" :data="store.products" stripe>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="name" label="商品名称" min-width="180" />
      <el-table-column prop="category" label="分类" width="120" />
      <el-table-column label="价格（元）" width="120">
        <template #default="{ row }">
          ¥ {{ formatPriceInCents(row.priceInCents) }}
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
            {{ row.status === 1 ? '上架' : '下架' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 1"
            type="primary"
            link
            :loading="cartStore.loading"
            @click="addToCart(row.id)"
          >
            加购
          </el-button>
        </template>
      </el-table-column>
      
    </el-table>

    <div class="pager">
      <el-pagination
        background
        layout="total, prev, pager, next"
        :total="store.total"
        :page-size="store.size"
        :current-page="store.page"
        @current-change="handlePageChange"
      />
    </div>
  </el-card>

  <el-dialog v-model="dialogVisible" title="新增商品" width="420px">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="88px">
      <el-form-item label="名称" prop="name">
        <el-input v-model="form.name" placeholder="商品名称" />
      </el-form-item>
      <el-form-item label="价格(元)" prop="priceYuan">
        <el-input-number v-model="form.priceYuan" :min="0.01" :step="1" :precision="2" />
      </el-form-item>
      <el-form-item label="分类">
        <el-input v-model="form.category" placeholder="分类" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" @click="submitForm">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.title {
  font-size: 18px;
  font-weight: 600;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>

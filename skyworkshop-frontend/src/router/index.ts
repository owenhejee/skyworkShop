import { createRouter, createWebHistory } from 'vue-router'
import ProductListView from '@/views/product/ProductListView.vue'
import CartView from '@/views/cart/CartView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/products' },
    { path: '/products', name: 'products', component: ProductListView },
    { path: '/cart', name: 'cart', component: CartView },
  ],
})

export default router

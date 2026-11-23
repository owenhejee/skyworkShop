import { defineStore } from 'pinia'
import { ref } from 'vue'
import { addCartItem, fetchCart } from '@/api/cart'
import type { Cart, CartAddPayload } from '@/types/cart'

export const useCartStore = defineStore('cart', () => {
  const cart = ref<Cart>({ items: [], totalPriceInCents: 0 })
  const loading = ref(false)

  async function loadCart() {
    loading.value = true
    try {
      const { data } = await fetchCart()
      cart.value = data.data
    } finally {
      loading.value = false
    }
  }

  async function addItem(payload: CartAddPayload) {
    loading.value = true
    try {
      const { data } = await addCartItem(payload)
      cart.value = data.data
    } finally {
      loading.value = false
    }
  }

  return { cart, loading, loadCart, addItem }
})

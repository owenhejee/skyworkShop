import type { ApiResult } from '@/types/product'

export interface CartItem {
  productId: number
  name: string
  quantity: number
  priceInCents: number
  subtotalInCents: number
}

export interface Cart {
  items: CartItem[]
  totalPriceInCents: number
}

export interface CartAddPayload {
  productId: number
  quantity: number
}

export type { ApiResult }

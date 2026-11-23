import request from '@/api/request'
import type { ApiResult, Cart, CartAddPayload } from '@/types/cart'

const USER_HEADER = { 'X-User-Id': '1' }

export function fetchCart() {
  return request.get<ApiResult<Cart>>('/api/v1/cart', { headers: USER_HEADER })
}

export function addCartItem(payload: CartAddPayload) {
  return request.post<ApiResult<Cart>>('/api/v1/cart/items', payload, { headers: USER_HEADER })
}

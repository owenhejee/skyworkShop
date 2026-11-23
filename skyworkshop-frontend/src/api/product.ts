import request from '@/api/request'
import type { ApiResult, PageResult, Product, ProductCreatePayload } from '@/types/product'

export function fetchProducts(params: {
  page?: number
  size?: number
  keyword?: string
  category?: string
}) {
  return request.get<ApiResult<PageResult<Product>>>('/api/v1/products', { params })
}

export function fetchProductById(id: number) {
  return request.get<ApiResult<Product>>(`/api/v1/products/${id}`)
}

export function createProduct(payload: ProductCreatePayload) {
  return request.post<ApiResult<Product>>('/api/v1/products', payload)
}

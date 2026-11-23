export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  size: number
}

export interface Product {
  id: number
  name: string
  /** 价格（分） */
  priceInCents: number
  category: string
  status: number
}

export interface ProductCreatePayload {
  name: string
  priceInCents: number
  category?: string
}

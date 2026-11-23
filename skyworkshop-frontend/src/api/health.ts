import axios from 'axios'
import type { ApiResult } from '@/types/product'
import type { HealthInfo } from '@/types/health'

const healthClient = axios.create({
  baseURL: '/',
  timeout: 5000,
})

export async function fetchHealth(): Promise<HealthInfo | null> {
  try {
    const { data } = await healthClient.get<ApiResult<HealthInfo>>('/health')
    if (data.code === 200 && data.data?.status === 'UP') {
      return data.data
    }
    return null
  } catch {
    return null
  }
}

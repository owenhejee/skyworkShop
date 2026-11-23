import { onMounted, onUnmounted, ref } from 'vue'
import { fetchHealth } from '@/api/health'
import type { BackendHealthState } from '@/types/health'

const POLL_INTERVAL_MS = 30_000

export function useBackendHealth() {
  const state = ref<BackendHealthState>('checking')
  const serviceName = ref('skyworkshop-backend')
  const lastCheckedAt = ref<Date | null>(null)
  const latencyMs = ref<number | null>(null)

  let timer: ReturnType<typeof setInterval> | undefined

  async function check() {
    state.value = 'checking'
    const startedAt = performance.now()
    const info = await fetchHealth()
    latencyMs.value = Math.round(performance.now() - startedAt)
    lastCheckedAt.value = new Date()

    if (info) {
      state.value = 'up'
      serviceName.value = info.service
      return
    }

    state.value = 'down'
  }

  onMounted(() => {
    void check()
    timer = setInterval(() => void check(), POLL_INTERVAL_MS)
  })

  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  return { state, serviceName, lastCheckedAt, latencyMs, check }
}

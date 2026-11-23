<script setup lang="ts">
import { computed } from 'vue'
import { useBackendHealth } from '@/composables/useBackendHealth'
import type { BackendHealthState } from '@/types/health'

const { state, serviceName, lastCheckedAt, latencyMs, check } = useBackendHealth()

const statusLabel = computed(() => {
  const labels: Record<BackendHealthState, string> = {
    checking: '检测中',
    up: '运行正常',
    down: '连接失败',
  }
  return labels[state.value]
})

const statusColor = computed(() => {
  const colors: Record<BackendHealthState, string> = {
    up: '#52c41a',
    down: '#ff4d4f',
    checking: '#faad14',
  }
  return colors[state.value]
})

const lastCheckedText = computed(() => {
  if (!lastCheckedAt.value) return '尚未检测'
  return lastCheckedAt.value.toLocaleTimeString('zh-CN', { hour12: false })
})

const tooltipContent = computed(() => {
  const lines = [
    `服务：${serviceName.value}`,
    `状态：${statusLabel.value}`,
    `检测时间：${lastCheckedText.value}`,
  ]
  if (latencyMs.value !== null && state.value !== 'checking') {
    lines.push(`响应：${latencyMs.value} ms`)
  }
  lines.push('点击手动刷新')
  return lines.join('\n')
})
</script>

<template>
  <el-tooltip :content="tooltipContent" placement="bottom-end" :show-after="200">
    <button
      type="button"
      class="health-indicator"
      :class="`health-indicator--${state}`"
      :aria-label="`后端服务${statusLabel}`"
      @click="check"
    >
      <svg class="health-indicator__icon" viewBox="0 0 20 20" aria-hidden="true">
        <rect
          x="2"
          y="3"
          width="16"
          height="5.5"
          rx="1"
          fill="rgba(255,255,255,0.12)"
          :stroke="statusColor"
          stroke-width="1.3"
        />
        <rect
          x="2"
          y="11.5"
          width="16"
          height="5.5"
          rx="1"
          fill="rgba(255,255,255,0.12)"
          :stroke="statusColor"
          stroke-width="1.3"
        />
        <circle cx="4.5" cy="5.75" r="1.3" :fill="statusColor" />
        <circle cx="4.5" cy="14.25" r="1.3" :fill="statusColor" />
        <line x1="7" y1="5.75" x2="15" y2="5.75" :stroke="statusColor" stroke-width="1.2" stroke-linecap="round" opacity="0.7" />
        <line x1="7" y1="14.25" x2="12" y2="14.25" :stroke="statusColor" stroke-width="1.2" stroke-linecap="round" opacity="0.7" />
        <circle class="health-indicator__dot" cx="17" cy="17" r="3.2" :fill="statusColor" />
        <circle cx="17" cy="17" r="3.2" fill="none" stroke="#fff" stroke-width="1" />
      </svg>
    </button>
  </el-tooltip>
</template>

<style scoped>
.health-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  line-height: 0;
  transition: background 0.15s;
}

.health-indicator:hover {
  background: rgba(255, 255, 255, 0.15);
}

.health-indicator:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

.health-indicator__icon {
  width: 20px;
  height: 20px;
  overflow: visible;
}

.health-indicator__dot {
  filter: drop-shadow(0 0 3px currentColor);
}

.health-indicator--up .health-indicator__dot {
  animation: pulse-dot 1.8s ease-in-out infinite;
}

.health-indicator--checking .health-indicator__dot {
  animation: blink-dot 0.8s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@keyframes blink-dot {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
}
</style>

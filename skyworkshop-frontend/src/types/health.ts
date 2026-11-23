export type BackendHealthState = 'checking' | 'up' | 'down'

export interface HealthInfo {
  status: string
  service: string
}

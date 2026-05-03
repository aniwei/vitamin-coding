import type { LogEntry } from '../types/logs'
import { getJson } from './core'

export async function fetchLogHistory(options?: {
  limit?: number
  level?: string
  module?: string
}): Promise<{ entries: LogEntry[]; total: number }> {
  const params = new URLSearchParams()
  if (options?.limit) {
    params.set('limit', String(options.limit))
  }
  if (options?.level) {
    params.set('level', options.level)
  }
  if (options?.module) {
    params.set('module', options.module)
  }
  return getJson(`/logs/history?${params}`)
}

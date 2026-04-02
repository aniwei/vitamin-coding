// Stream Metrics Hook — 流式响应性能追踪
import { createLogger } from '@vitamin/shared'
import type { HookRegistration } from '../../types'

const log = createLogger('@vitamin/hooks:stream-metrics')

// 每 session 的流式指标
const sessionMetrics = new Map<string, StreamMetrics>()

interface StreamMetrics {
  startTime: number
  model: string
  requestCount: number
  lastStopReason: string
  totalDurationMs: number
}

export function createStreamMetricsHook(): HookRegistration<'stream.start'> {
  return {
    name: 'stream-metrics',
    timing: 'stream.start',
    priority: 10,
    enabled: true,
    handle(input: { sessionId: string; model: string }): void {
      sessionMetrics.set(input.sessionId, {
        startTime: Date.now(),
        model: input.model,
        requestCount: (sessionMetrics.get(input.sessionId)?.requestCount ?? 0) + 1,
        lastStopReason: '',
        totalDurationMs: sessionMetrics.get(input.sessionId)?.totalDurationMs ?? 0,
      })
      log.debug('Stream started: session=%s model=%s', input.sessionId, input.model)
    },
  }
}

export function createStreamEndMetricsHook(): HookRegistration<'stream.end'> {
  return {
    name: 'stream-end-metrics',
    timing: 'stream.end',
    priority: 10,
    enabled: true,
    handle(input: { sessionId: string; model: string; stopReason: string }): void {
      const metrics = sessionMetrics.get(input.sessionId)
      if (metrics) {
        const duration = Date.now() - metrics.startTime
        metrics.totalDurationMs += duration
        metrics.lastStopReason = input.stopReason
        log.debug(
          'Stream ended: session=%s model=%s duration=%dms stopReason=%s total=%dms',
          input.sessionId,
          input.model,
          duration,
          input.stopReason,
          metrics.totalDurationMs,
        )
      }
    },
  }
}

export function getStreamMetrics(sessionId: string): StreamMetrics | undefined {
  return sessionMetrics.get(sessionId)
}

export function clearStreamMetrics(sessionId: string): void {
  sessionMetrics.delete(sessionId)
}

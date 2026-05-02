// Tool Error Tracker Hook — 工具错误频率追踪 + 熔断检测
import { createLogger } from '@x-mars/shared'
import { defineHook } from '../../hook-spec'
import type { HookSpec } from '../../hook-spec'

const log = createLogger('@x-mars/hooks:tool-error-tracker')

interface ToolErrorRecord {
  toolName: string
  errorCount: number
  lastErrorTime: number
  consecutiveErrors: number
}

// 每 session 的工具错误追踪
const sessionErrors = new Map<string, Map<string, ToolErrorRecord>>()

export interface ToolErrorTrackerConfig {
  /** 单工具连续错误阈值，超过后标记熔断 (默认 5) */
  circuitBreakerThreshold?: number
  /** 错误记录衰减窗口 ms (默认 120_000) */
  decayWindowMs?: number
}

export function createToolErrorTrackerHook(config?: ToolErrorTrackerConfig): HookSpec {
  const threshold = config?.circuitBreakerThreshold ?? 5
  const decayMs = config?.decayWindowMs ?? 120_000

  return defineHook({
    name: 'tool-error-tracker',
    timing: 'tool.execute.after',
    priority: 15,
    handle(input, output) {
      const toolMap = sessionErrors.get(input.sessionId) ?? new Map<string, ToolErrorRecord>()
      sessionErrors.set(input.sessionId, toolMap)

      let record = toolMap.get(input.toolName)

      // 衰减：超时则重置
      if (record && Date.now() - record.lastErrorTime > decayMs) {
        record = undefined
      }

      if (input.result.isError) {
        if (!record) {
          record = {
            toolName: input.toolName,
            errorCount: 0,
            lastErrorTime: 0,
            consecutiveErrors: 0,
          }
        }
        record.errorCount++
        record.consecutiveErrors++
        record.lastErrorTime = Date.now()
        toolMap.set(input.toolName, record)

        if (record.consecutiveErrors >= threshold) {
          const msg = `Tool "${input.toolName}" hit circuit-breaker: ${record.consecutiveErrors} consecutive errors`
          log.warn(msg)
          output.metadata.toolCircuitBreaker = {
            toolName: input.toolName,
            consecutiveErrors: record.consecutiveErrors,
            tripped: true,
          }
        }
      } else if (record) {
        // 成功调用重置连续计数
        record.consecutiveErrors = 0
        toolMap.set(input.toolName, record)
      }
    },
  })
}

export function getToolErrors(sessionId: string): Map<string, ToolErrorRecord> | undefined {
  return sessionErrors.get(sessionId)
}

export function clearToolErrors(sessionId: string): void {
  sessionErrors.delete(sessionId)
}

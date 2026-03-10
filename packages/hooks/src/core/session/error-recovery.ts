// Error Recovery Hook — 会话错误时尝试自动恢复 (§S14.2)
import type { HookRegistration, SessionEventInput } from '../../types'
import { createLogger } from '@vitamin/shared'

const logger = createLogger('@vitamin/hooks:error-recovery')

export interface ErrorRecoveryConfig {
  // 最大自动恢复尝试次数
  maxRetries: number
  // 可恢复的错误类型模式
  recoverablePatterns: RegExp[]
  // 恢复回调
  recover: (sessionId: string, error: Error) => void
}

const DEFAULT_RECOVERABLE_PATTERNS = [
  /rate_limit/i,
  /timeout/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /overloaded/i,
  /529/,
  /503/,
]

// 每 session 的重试计数
const retryCounters = new Map<string, number>()

export function createErrorRecoveryHook(
  config?: Partial<ErrorRecoveryConfig>,
): HookRegistration<'session.error'> {
  const maxRetries = config?.maxRetries ?? 3
  const patterns = config?.recoverablePatterns ?? DEFAULT_RECOVERABLE_PATTERNS
  const recoverFn = config?.recover

  return {
    name: 'error-recovery',
    timing: 'session.error',
    priority: 10,
    enabled: true,
    handler(input: SessionEventInput & { error: Error }): void {
      const { sessionId, error } = input
      const errorMessage = error.message

      const isRecoverable = patterns.some((pattern) => pattern.test(errorMessage))

      if (!isRecoverable) {
        logger.debug('Non-recoverable error in session %s: %s', sessionId, errorMessage)
        return
      }

      const currentRetries = retryCounters.get(sessionId) ?? 0

      if (currentRetries >= maxRetries) {
        logger.warn(
          'Session %s exceeded max retries (%d), not recovering',
          sessionId,
          maxRetries,
        )
        retryCounters.delete(sessionId)
        return
      }

      retryCounters.set(sessionId, currentRetries + 1)
      logger.info(
        'Recoverable error in session %s (attempt %d/%d): %s',
        sessionId,
        currentRetries + 1,
        maxRetries,
        errorMessage,
      )

      if (recoverFn) {
        recoverFn(sessionId, error)
      }
    },
  }
}

// 重置 session 的重试计数（在 session 成功恢复后调用）
export function resetErrorRecoveryCounter(sessionId: string): void {
  retryCounters.delete(sessionId)
}

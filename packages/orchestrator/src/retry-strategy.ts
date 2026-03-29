// ═══════════════════════════════════════════════════════════
// @vitamin/orchestrator — Retry Strategy
// ═══════════════════════════════════════════════════════════
// 策略化重试：exponential backoff / circuit breaker

// ═══ 数据模型 ═══

export interface RetryPolicy {
  maxAttempts: number
  backoff: 'exponential' | 'linear' | 'none'
  baseDelayMs: number
  maxDelayMs: number
  retryableErrors: string[]
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoff: 'exponential',
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableErrors: ['EXECUTION_ERROR', 'BG_ERROR', 'MAX_CONCURRENT', 'TIMEOUT'],
}

// ═══ Retry Strategy ═══

export interface RetryStrategy {
  shouldRetry(error: { code: string; retriable: boolean }, attempt: number): boolean
  getDelay(attempt: number): number
}

export function createRetryStrategy(policy?: Partial<RetryPolicy>): RetryStrategy {
  const p: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...policy }

  return {
    shouldRetry(error, attempt) {
      if (attempt >= p.maxAttempts) return false
      if (!error.retriable) return false
      if (p.retryableErrors.length > 0 && !p.retryableErrors.includes(error.code)) return false
      return true
    },

    getDelay(attempt) {
      switch (p.backoff) {
        case 'exponential':
          return Math.min(p.baseDelayMs * 2 ** attempt, p.maxDelayMs)
        case 'linear':
          return Math.min(p.baseDelayMs * (attempt + 1), p.maxDelayMs)
        case 'none':
          return 0
      }
    },
  }
}

// ═══ Circuit Breaker ═══

export type CircuitState = 'closed' | 'open' | 'half_open'

export interface CircuitBreaker {
  readonly state: CircuitState
  recordSuccess(): void
  recordFailure(): void
  canExecute(): boolean
  reset(): void
}

export interface CircuitBreakerOptions {
  /** Number of consecutive failures to trip open. Default: 5 */
  failureThreshold?: number
  /** Time in ms before trying half-open. Default: 60000 */
  resetTimeoutMs?: number
}

export function createCircuitBreaker(options?: CircuitBreakerOptions): CircuitBreaker {
  const failureThreshold = options?.failureThreshold ?? 5
  const resetTimeoutMs = options?.resetTimeoutMs ?? 60000

  let state: CircuitState = 'closed'
  let failures = 0
  let lastFailureTime = 0

  return {
    get state() {
      // Check if enough time has passed to transition to half-open
      if (state === 'open' && Date.now() - lastFailureTime >= resetTimeoutMs) {
        state = 'half_open'
      }
      return state
    },

    recordSuccess() {
      failures = 0
      state = 'closed'
    },

    recordFailure() {
      failures++
      lastFailureTime = Date.now()
      if (failures >= failureThreshold) {
        state = 'open'
      }
    },

    canExecute() {
      // Re-evaluate open → half_open transition
      if (state === 'open' && Date.now() - lastFailureTime >= resetTimeoutMs) {
        state = 'half_open'
      }
      return state !== 'open'
    },

    reset() {
      state = 'closed'
      failures = 0
      lastFailureTime = 0
    },
  }
}

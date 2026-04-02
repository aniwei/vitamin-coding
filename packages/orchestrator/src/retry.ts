import type { WorkflowOptions } from './types'

// ═══ RetryPolicy ═══

export interface RetryConfig {
  enabled: boolean
  maxAttempts: number
  backoffMs: number
  backoffMultiplier: number
}

const DEFAULT_RETRY: RetryConfig = {
  enabled: true,
  maxAttempts: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
}

export class RetryPolicy {
  private readonly config: RetryConfig

  constructor(config?: Partial<RetryConfig>) {
    this.config = { ...DEFAULT_RETRY, ...config }
  }

  shouldRetry(attempt: number): boolean {
    return this.config.enabled && attempt < this.config.maxAttempts
  }

  getBackoff(attempt: number): number {
    return this.config.backoffMs * (this.config.backoffMultiplier ** (attempt - 1))
  }

  static fromWorkflowOptions(wf?: WorkflowOptions): RetryPolicy {
    const retry = wf?.retry as
      | { enabled?: boolean; backoffMs?: number; maxAttempts?: number }
      | undefined

    return new RetryPolicy({
      enabled: retry?.enabled ?? true,
      maxAttempts: retry?.maxAttempts ?? 3,
    })
  }
}

// ═══ CircuitBreaker ═══

export interface CircuitBreakerConfig {
  enabled: boolean
  failureThreshold: number
  resetTimeoutMs: number
}

const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  enabled: true,
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
}

export class CircuitBreaker {
  private readonly enabled: boolean
  private readonly failureThreshold: number
  private readonly resetTimeoutMs: number
  private consecutiveFailures = 0
  private openedAt: number | null = null

  constructor(config?: Partial<CircuitBreakerConfig>) {
    const resolvedConfig = { ...DEFAULT_CIRCUIT_BREAKER, ...config }

    this.enabled = resolvedConfig.enabled
    this.failureThreshold = resolvedConfig.failureThreshold
    this.resetTimeoutMs = resolvedConfig.resetTimeoutMs
  }

  isOpen(): boolean {
    if (!this.enabled) return false
    if (this.openedAt === null) return false

    // 半开：距上次打开超过 resetTimeoutMs 则自动尝试恢复
    if (Date.now() - this.openedAt >= this.resetTimeoutMs) {
      this.openedAt = null
      this.consecutiveFailures = 0
      return false
    }

    return true
  }

  success(): void {
    this.consecutiveFailures = 0
    this.openedAt = null
  }

  failure(): void {
    this.consecutiveFailures++
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.openedAt = Date.now()
    }
  }

  reset(): void {
    this.consecutiveFailures = 0
    this.openedAt = null
  }

  static fromWorkflowOptions(wf?: WorkflowOptions): CircuitBreaker {
    const circuitCamel = (wf as {
      circuitBreaker?: {
        enabled?: boolean
        failureThreshold?: number
        resetTimeoutMs?: number
      }
    } | undefined)?.circuitBreaker
    const circuitSnake = (wf as {
      circuitBreaker?: {
        enabled?: boolean
        failureThreshold?: number
        timeoutMs?: number
      }
    } | undefined)?.circuitBreaker

    return new CircuitBreaker({
      enabled: circuitCamel?.enabled ?? circuitSnake?.enabled ?? true,
      failureThreshold: circuitCamel?.failureThreshold ?? circuitSnake?.failureThreshold ?? 5,
      resetTimeoutMs: circuitCamel?.resetTimeoutMs ?? circuitSnake?.timeoutMs ?? 60_000,
    })
  }
}

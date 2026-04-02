// @vitamin/orchestrator — 重试策略 + 熔断器
// 配置来自 WorkflowConfig.retry / WorkflowConfig.circuit_breaker

import type { WorkflowConfig } from './types'

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

  static fromWorkflowConfig(wf?: WorkflowConfig): RetryPolicy {
    return new RetryPolicy({
      enabled: wf?.retry?.enabled ?? true,
      maxAttempts: wf?.retry?.max_attempts ?? 3,
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
  private readonly config: CircuitBreakerConfig
  private consecutiveFailures = 0
  private openedAt: number | null = null

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER, ...config }
  }

  isOpen(): boolean {
    if (!this.config.enabled) return false
    if (this.openedAt === null) return false

    // 半开：距上次打开超过 resetTimeoutMs 则自动尝试恢复
    if (Date.now() - this.openedAt >= this.config.resetTimeoutMs) {
      this.openedAt = null
      this.consecutiveFailures = 0
      return false
    }

    return true
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0
    this.openedAt = null
  }

  recordFailure(): void {
    this.consecutiveFailures++
    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.openedAt = Date.now()
    }
  }

  reset(): void {
    this.consecutiveFailures = 0
    this.openedAt = null
  }

  static fromWorkflowConfig(wf?: WorkflowConfig): CircuitBreaker {
    return new CircuitBreaker({
      enabled: wf?.circuit_breaker?.enabled ?? true,
      failureThreshold: wf?.circuit_breaker?.failure_threshold ?? 5,
      resetTimeoutMs: wf?.circuit_breaker?.reset_timeout_ms ?? 60_000,
    })
  }
}

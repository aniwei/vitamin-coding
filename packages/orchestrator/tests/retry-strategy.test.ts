import { describe, it, expect } from 'vitest'
import {
  createRetryStrategy,
  createCircuitBreaker,
  DEFAULT_RETRY_POLICY,
} from '../src/retry-strategy'

// ═══ RetryStrategy ═══

describe('createRetryStrategy', () => {
  it('allows retry for retriable errors under maxAttempts', () => {
    const strategy = createRetryStrategy()
    const result = strategy.shouldRetry(
      { code: 'EXECUTION_ERROR', retriable: true },
      0,
    )
    expect(result).toBe(true)
  })

  it('denies retry at maxAttempts', () => {
    const strategy = createRetryStrategy({ maxAttempts: 3 })
    const result = strategy.shouldRetry(
      { code: 'EXECUTION_ERROR', retriable: true },
      3,
    )
    expect(result).toBe(false)
  })

  it('denies retry for non-retriable errors', () => {
    const strategy = createRetryStrategy()
    const result = strategy.shouldRetry(
      { code: 'EXECUTION_ERROR', retriable: false },
      0,
    )
    expect(result).toBe(false)
  })

  it('denies retry for error codes not in retryableErrors', () => {
    const strategy = createRetryStrategy({
      retryableErrors: ['EXECUTION_ERROR'],
    })
    const result = strategy.shouldRetry(
      { code: 'UNKNOWN_CODE', retriable: true },
      0,
    )
    expect(result).toBe(false)
  })

  it('allows retry for all codes in retryableErrors', () => {
    const strategy = createRetryStrategy()
    for (const code of DEFAULT_RETRY_POLICY.retryableErrors) {
      expect(strategy.shouldRetry({ code, retriable: true }, 0)).toBe(true)
    }
  })

  // ═══ Exponential backoff ═══

  it('exponential backoff doubles with each attempt', () => {
    const strategy = createRetryStrategy({
      backoff: 'exponential',
      baseDelayMs: 1000,
      maxDelayMs: 30000,
    })

    expect(strategy.getDelay(0)).toBe(1000)    // 1000 * 2^0
    expect(strategy.getDelay(1)).toBe(2000)    // 1000 * 2^1
    expect(strategy.getDelay(2)).toBe(4000)    // 1000 * 2^2
    expect(strategy.getDelay(3)).toBe(8000)    // 1000 * 2^3
  })

  it('exponential backoff caps at maxDelayMs', () => {
    const strategy = createRetryStrategy({
      backoff: 'exponential',
      baseDelayMs: 1000,
      maxDelayMs: 5000,
    })

    expect(strategy.getDelay(10)).toBe(5000)
  })

  // ═══ Linear backoff ═══

  it('linear backoff increases linearly', () => {
    const strategy = createRetryStrategy({
      backoff: 'linear',
      baseDelayMs: 1000,
      maxDelayMs: 10000,
    })

    expect(strategy.getDelay(0)).toBe(1000)    // 1000 * 1
    expect(strategy.getDelay(1)).toBe(2000)    // 1000 * 2
    expect(strategy.getDelay(2)).toBe(3000)    // 1000 * 3
  })

  it('linear backoff caps at maxDelayMs', () => {
    const strategy = createRetryStrategy({
      backoff: 'linear',
      baseDelayMs: 1000,
      maxDelayMs: 2500,
    })

    expect(strategy.getDelay(5)).toBe(2500)
  })

  // ═══ No backoff ═══

  it('none backoff always returns 0', () => {
    const strategy = createRetryStrategy({ backoff: 'none' })

    expect(strategy.getDelay(0)).toBe(0)
    expect(strategy.getDelay(5)).toBe(0)
    expect(strategy.getDelay(100)).toBe(0)
  })

  // ═══ Default policy ═══

  it('DEFAULT_RETRY_POLICY has expected values', () => {
    expect(DEFAULT_RETRY_POLICY.maxAttempts).toBe(3)
    expect(DEFAULT_RETRY_POLICY.backoff).toBe('exponential')
    expect(DEFAULT_RETRY_POLICY.baseDelayMs).toBe(1000)
    expect(DEFAULT_RETRY_POLICY.maxDelayMs).toBe(30000)
    expect(DEFAULT_RETRY_POLICY.retryableErrors).toContain('EXECUTION_ERROR')
    expect(DEFAULT_RETRY_POLICY.retryableErrors).toContain('TIMEOUT')
  })
})

// ═══ CircuitBreaker ═══

describe('createCircuitBreaker', () => {
  it('starts in closed state', () => {
    const cb = createCircuitBreaker()
    expect(cb.state).toBe('closed')
    expect(cb.canExecute()).toBe(true)
  })

  it('stays closed under failure threshold', () => {
    const cb = createCircuitBreaker({ failureThreshold: 3 })

    cb.recordFailure()
    cb.recordFailure()

    expect(cb.state).toBe('closed')
    expect(cb.canExecute()).toBe(true)
  })

  it('opens after reaching failure threshold', () => {
    const cb = createCircuitBreaker({ failureThreshold: 3 })

    cb.recordFailure()
    cb.recordFailure()
    cb.recordFailure()

    expect(cb.state).toBe('open')
    expect(cb.canExecute()).toBe(false)
  })

  it('success resets failure count', () => {
    const cb = createCircuitBreaker({ failureThreshold: 3 })

    cb.recordFailure()
    cb.recordFailure()
    cb.recordSuccess()

    // Failures reset, need 3 more to trip
    cb.recordFailure()
    expect(cb.state).toBe('closed')
  })

  it('success from open transitions to closed', () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 })

    cb.recordFailure()
    expect(cb.state).toBe('open')

    cb.recordSuccess()
    expect(cb.state).toBe('closed')
    expect(cb.canExecute()).toBe(true)
  })

  it('reset() returns to closed state', () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 })

    cb.recordFailure()
    expect(cb.state).toBe('open')

    cb.reset()
    expect(cb.state).toBe('closed')
    expect(cb.canExecute()).toBe(true)
  })

  it('transitions to half_open after resetTimeout', () => {
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 10, // very short for testing
    })

    cb.recordFailure()
    expect(cb.state).toBe('open')

    // Wait for timeout to elapse
    const start = Date.now()
    while (Date.now() - start < 15) {
      // busy wait
    }

    expect(cb.state).toBe('half_open')
    expect(cb.canExecute()).toBe(true)
  })

  it('default failure threshold is 5', () => {
    const cb = createCircuitBreaker()

    for (let i = 0; i < 4; i++) cb.recordFailure()
    expect(cb.state).toBe('closed')

    cb.recordFailure()
    expect(cb.state).toBe('open')
  })

  it('canExecute() checks half_open transition', () => {
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 10,
    })

    cb.recordFailure()
    expect(cb.canExecute()).toBe(false)

    const start = Date.now()
    while (Date.now() - start < 15) { /* busy wait */ }

    expect(cb.canExecute()).toBe(true)
  })
})

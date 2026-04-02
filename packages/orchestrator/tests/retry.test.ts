import { describe, expect, it } from 'vitest'
import { RetryPolicy, CircuitBreaker } from '../src/retry'

describe('RetryPolicy', () => {
  it('allows retries up to maxAttempts', () => {
    const policy = new RetryPolicy({ enabled: true, maxAttempts: 3 })
    expect(policy.shouldRetry(1)).toBe(true)
    expect(policy.shouldRetry(2)).toBe(true)
    expect(policy.shouldRetry(3)).toBe(false)
  })

  it('disallows retries when disabled', () => {
    const policy = new RetryPolicy({ enabled: false, maxAttempts: 3 })
    expect(policy.shouldRetry(1)).toBe(false)
  })

  it('calculates exponential backoff', () => {
    const policy = new RetryPolicy({ backoffMs: 1000, backoffMultiplier: 2 })
    expect(policy.getBackoff(1)).toBe(1000)
    expect(policy.getBackoff(2)).toBe(2000)
    expect(policy.getBackoff(3)).toBe(4000)
  })
})

describe('CircuitBreaker', () => {
  it('starts closed', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 })
    expect(cb.isOpen()).toBe(false)
  })

  it('opens after reaching failure threshold', () => {
    const cb = new CircuitBreaker({ enabled: true, failureThreshold: 3, resetTimeoutMs: 60_000 })
    cb.failure()
    cb.failure()
    expect(cb.isOpen()).toBe(false)
    cb.failure()
    expect(cb.isOpen()).toBe(true)
  })

  it('resets on success', () => {
    const cb = new CircuitBreaker({ enabled: true, failureThreshold: 2, resetTimeoutMs: 60_000 })
    cb.failure()
    cb.failure()
    expect(cb.isOpen()).toBe(true)
    cb.success()
    expect(cb.isOpen()).toBe(false)
  })

  it('stays closed when disabled', () => {
    const cb = new CircuitBreaker({ enabled: false, failureThreshold: 1 })
    cb.failure()
    cb.failure()
    expect(cb.isOpen()).toBe(false)
  })

  it('resets via reset()', () => {
    const cb = new CircuitBreaker({ enabled: true, failureThreshold: 1, resetTimeoutMs: 60_000 })
    cb.failure()
    expect(cb.isOpen()).toBe(true)
    cb.reset()
    expect(cb.isOpen()).toBe(false)
  })
})

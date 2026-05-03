import { describe, expect, it } from 'vitest'
import { createErrorRecoveryHook, resetErrorRecoveryCounter } from '../src/index'

describe('createErrorRecoveryHook', () => {
  it('#handles recoverable error within retry limit', () => {
    const recovered: Array<{ sessionId: string; error: Error }> = []
    const hook = createErrorRecoveryHook({
      maxRetries: 2,
      recoverablePatterns: [/rate limit/i, /timeout/i],
      recover: (sessionId, error) => recovered.push({ sessionId, error }),
    })

    const error = new Error('Rate limit exceeded')
    hook.handle({ sessionId: 'sess-1', metadata: {}, error }, undefined as never)

    expect(recovered).toHaveLength(1)
    expect(recovered[0]!.sessionId).toBe('sess-1')
  })

  it('#stops recovering after maxRetries', () => {
    const recovered: string[] = []
    const hook = createErrorRecoveryHook({
      maxRetries: 2,
      recoverablePatterns: [/timeout/i],
      recover: (sessionId) => recovered.push(sessionId),
    })

    const error = new Error('Timeout occurred')
    const input = { sessionId: 'sess-2', metadata: {}, error }

    hook.handle(input, undefined as never)
    hook.handle(input, undefined as never)
    hook.handle(input, undefined as never) // exceeds limit

    expect(recovered).toHaveLength(2)
  })

  it('#ignores non-recoverable errors', () => {
    const recovered: string[] = []
    const hook = createErrorRecoveryHook({
      recoverablePatterns: [/timeout/i],
      recover: (sessionId) => recovered.push(sessionId),
    })

    hook.handle(
      { sessionId: 'sess-3', metadata: {}, error: new Error('Unknown failure') },
      undefined as never,
    )

    expect(recovered).toHaveLength(0)
  })

  it('#uses default patterns when none provided', () => {
    const hook = createErrorRecoveryHook()
    expect(hook.name).toBe('error-recovery')
    expect(hook.timing).toBe('session.error')
  })
})

describe('resetErrorRecoveryCounter', () => {
  it('#allows retries again after reset', () => {
    const recovered: string[] = []
    const hook = createErrorRecoveryHook({
      maxRetries: 1,
      recoverablePatterns: [/timeout/i],
      recover: (sid) => recovered.push(sid),
    })

    const error = new Error('Timeout')
    const input = { sessionId: 'sess-4', metadata: {}, error }

    hook.handle(input, undefined as never)
    hook.handle(input, undefined as never) // now exceeded
    expect(recovered).toHaveLength(1)

    resetErrorRecoveryCounter('sess-4')

    hook.handle(input, undefined as never)
    expect(recovered).toHaveLength(2)
  })
})

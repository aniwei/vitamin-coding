import { describe, expect, it } from 'vitest'
import { createIdleContinuationHook } from '../src/index'

describe('createIdleContinuationHook', () => {
  it('#resumes work when hasPendingWork returns true', () => {
    const resumed: string[] = []

    const hook = createIdleContinuationHook({
      hasPendingWork: (sessionId) => sessionId === 'sess-active',
      resumeWork: (sessionId) => resumed.push(sessionId),
    })

    hook.handle(
      { sessionId: 'sess-active', metadata: {} },
      undefined as never,
    )

    expect(resumed).toEqual(['sess-active'])
  })

  it('#does nothing when hasPendingWork returns false', () => {
    const resumed: string[] = []

    const hook = createIdleContinuationHook({
      hasPendingWork: () => false,
      resumeWork: (sessionId) => resumed.push(sessionId),
    })

    hook.handle(
      { sessionId: 'sess-idle', metadata: {} },
      undefined as never,
    )

    expect(resumed).toHaveLength(0)
  })

  it('#has correct hook metadata', () => {
    const hook = createIdleContinuationHook({
      hasPendingWork: () => false,
      resumeWork: () => {},
    })

    expect(hook.name).toBe('idle-continuation')
    expect(hook.timing).toBe('session.idle')
    expect(hook.priority).toBe(50)
  })
})

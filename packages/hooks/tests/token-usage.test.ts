import { describe, expect, it } from 'vitest'
import {
  trackTokenUsage,
  getTokenUsage,
  clearTokenUsage,
} from '../src/index'

describe('Token usage tracking utilities', () => {
  it('#trackTokenUsage accumulates per session', () => {
    const sid = `token-${Date.now()}`
    trackTokenUsage(sid, 'gpt-4', 100, 50)
    trackTokenUsage(sid, 'gpt-4', 200, 100)

    const usage = getTokenUsage(sid)
    expect(usage).toBeDefined()
    expect(usage!.totalInput).toBe(300)
    expect(usage!.totalOutput).toBe(150)
    expect(usage!.model).toBe('gpt-4')
  })

  it('#getTokenUsage returns undefined for unknown session', () => {
    expect(getTokenUsage('nonexistent-session')).toBeUndefined()
  })

  it('#clearTokenUsage removes session data', () => {
    const sid = `clear-token-${Date.now()}`
    trackTokenUsage(sid, 'claude', 50, 25)
    expect(getTokenUsage(sid)).toBeDefined()

    clearTokenUsage(sid)
    expect(getTokenUsage(sid)).toBeUndefined()
  })

  it('#tracks different models when session switches', () => {
    const sid = `switch-model-${Date.now()}`
    trackTokenUsage(sid, 'gpt-4', 100, 50)
    trackTokenUsage(sid, 'claude-sonnet', 200, 100)

    const usage = getTokenUsage(sid)
    expect(usage!.model).toBe('claude-sonnet')
    expect(usage!.totalInput).toBe(300)
  })
})

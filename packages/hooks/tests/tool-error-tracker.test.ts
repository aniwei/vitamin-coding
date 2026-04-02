import { describe, expect, it } from 'vitest'
import {
  createToolErrorTrackerHook,
  getToolErrors,
  clearToolErrors,
} from '../src/index'
import type { ToolExecuteAfterOutput } from '../src/types'

function makeInput(toolName: string, sessionId: string, isError: boolean) {
  return {
    toolName,
    toolCallId: `tc_${toolName}`,
    args: {},
    result: { content: [{ type: 'text' as const, text: 'ok' }], isError },
    agentName: 'lead',
    sessionId,
    durationMs: 100,
  }
}

function makeOutput(): ToolExecuteAfterOutput {
  return {
    result: { content: [{ type: 'text' as const, text: 'ok' }] },
    metadata: {},
  }
}

describe('createToolErrorTrackerHook', () => {
  it('#tracks consecutive errors per tool', () => {
    const hook = createToolErrorTrackerHook({ circuitBreakerThreshold: 3 })
    const sid = `tracker-${Date.now()}`
    const output = makeOutput()

    hook.handle(makeInput('bash', sid, true), output)
    hook.handle(makeInput('bash', sid, true), output)

    const errors = getToolErrors(sid)
    expect(errors).toBeDefined()
    const record = errors!.get('bash')
    expect(record!.consecutiveErrors).toBe(2)
  })

  it('#trips circuit breaker at threshold', () => {
    const hook = createToolErrorTrackerHook({ circuitBreakerThreshold: 2 })
    const sid = `cb-${Date.now()}`
    const output = makeOutput()

    hook.handle(makeInput('grep', sid, true), output)
    const out2 = makeOutput()
    hook.handle(makeInput('grep', sid, true), out2)

    expect(out2.metadata.toolCircuitBreaker).toBeDefined()
    const cb = out2.metadata.toolCircuitBreaker as { tripped: boolean; consecutiveErrors: number }
    expect(cb.tripped).toBe(true)
    expect(cb.consecutiveErrors).toBe(2)
  })

  it('#resets consecutive count on success', () => {
    const hook = createToolErrorTrackerHook({ circuitBreakerThreshold: 5 })
    const sid = `reset-${Date.now()}`
    const output = makeOutput()

    hook.handle(makeInput('write', sid, true), output)
    hook.handle(makeInput('write', sid, true), output)
    hook.handle(makeInput('write', sid, false), output) // success

    const record = getToolErrors(sid)!.get('write')
    expect(record!.consecutiveErrors).toBe(0)
    expect(record!.errorCount).toBe(2)
  })

  it('#uses default threshold of 5 when no config', () => {
    const hook = createToolErrorTrackerHook()
    expect(hook.name).toBe('tool-error-tracker')
    expect(hook.timing).toBe('tool.execute.after')
  })
})

describe('clearToolErrors', () => {
  it('#removes all tracked errors for a session', () => {
    const hook = createToolErrorTrackerHook({ circuitBreakerThreshold: 10 })
    const sid = `clear-${Date.now()}`
    hook.handle(makeInput('bash', sid, true), makeOutput())

    expect(getToolErrors(sid)).toBeDefined()
    clearToolErrors(sid)
    expect(getToolErrors(sid)).toBeUndefined()
  })
})

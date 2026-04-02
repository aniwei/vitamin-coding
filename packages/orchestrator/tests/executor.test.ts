import { describe, expect, it } from 'vitest'
import { HookRegistry } from '@vitamin/hooks'
import { TaskStore } from '../src/task-store'
import { TaskExecutor } from '../src/executor'
import { RetryPolicy, CircuitBreaker } from '../src/retry'
import type { RunSessionOptions, RunSessionResult } from '../src/executor'

function makeRunSession(
  impl: (opts: RunSessionOptions) => Promise<RunSessionResult> | RunSessionResult = () => ({
    text: 'done',
    sessionId: 'sess-1',
    durationMs: 100,
  }),
): (opts: RunSessionOptions) => Promise<RunSessionResult> {
  return async (opts) => impl(opts)
}

function makeExecutor(overrides: {
  runSession?: (opts: RunSessionOptions) => Promise<RunSessionResult>
  maxActiveTasks?: number
  hookRegistry?: HookRegistry
  retryPolicy?: RetryPolicy
  circuitBreaker?: CircuitBreaker
} = {}) {
  const taskStore = new TaskStore()
  const hookRegistry = overrides.hookRegistry ?? new HookRegistry()
  const retryPolicy = overrides.retryPolicy ?? new RetryPolicy({ enabled: false })
  const circuitBreaker = overrides.circuitBreaker ?? new CircuitBreaker({ enabled: false })
  const runSession = overrides.runSession ?? makeRunSession()
  const maxActiveTasks = overrides.maxActiveTasks ?? 10

  return {
    executor: new TaskExecutor(taskStore, hookRegistry, retryPolicy, circuitBreaker, runSession, maxActiveTasks),
    taskStore,
    hookRegistry,
  }
}

describe('TaskExecutor.dispatch', () => {
  it('dispatches sync task and returns completed result', async () => {
    const { executor, taskStore } = makeExecutor({
      runSession: makeRunSession(() => ({
        text: 'hello world',
        sessionId: 'sess-42',
        durationMs: 200,
      })),
    })

    const result = await executor.dispatch({
      prompt: 'say hello',
      mode: 'sync',
    })

    expect(result.success).toBe(true)
    expect(result.output).toBe('hello world')
    expect(result.status).toBe('completed')
    expect(result.id).toBeDefined()

    // verify task is stored
    const task = await taskStore.get(result.id!)
    expect(task).toBeDefined()
    expect(task!.status).toBe('completed')
    expect(task!.output!.text).toBe('hello world')
  })

  it('forwards subagent and slot to runSession', async () => {
    const seen: RunSessionOptions[] = []
    const { executor } = makeExecutor({
      runSession: makeRunSession((opts) => {
        seen.push(opts)
        return {
          text: 'reviewed',
          sessionId: 'slot-sess',
          durationMs: 25,
        }
      }),
    })

    const result = await executor.dispatch({
      prompt: 'review this diff',
      subagent: 'quality-reviewer',
      slot: 'critique',
      sessionId: 'child-review',
      sessionMode: 'sticky',
      mode: 'sync',
    })

    expect(result.success).toBe(true)
    expect(seen).toEqual([{
      prompt: 'review this diff',
      sessionId: 'child-review',
      sessionMode: 'sticky',
      agentName: 'quality-reviewer',
      slot: 'critique',
    }])
  })

  it('returns error when runSession throws', async () => {
    const { executor } = makeExecutor({
      runSession: makeRunSession(() => { throw new Error('session failed') }),
    })

    const result = await executor.dispatch({ prompt: 'fail', mode: 'sync' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('session failed')
  })

  it('dispatches background task without waiting', async () => {
    let resolved = false
    const { executor } = makeExecutor({
      runSession: makeRunSession(async () => {
        await new Promise(r => setTimeout(r, 50))
        resolved = true
        return { text: 'bg done', sessionId: 'bg-1', durationMs: 50 }
      }),
    })

    const result = await executor.dispatch({ prompt: 'bg task', mode: 'background' })

    expect(result.success).toBe(true)
    expect(result.status).toBe('pending')
    expect(resolved).toBe(false)

    // wait for background to complete
    await new Promise(r => setTimeout(r, 150))
    expect(resolved).toBe(true)
  })

  it('rejects when max active tasks reached', async () => {
    const { executor } = makeExecutor({
      maxActiveTasks: 1,
      runSession: makeRunSession(async () => {
        await new Promise(r => setTimeout(r, 200))
        return { text: 'ok', sessionId: 's1', durationMs: 200 }
      }),
    })

    // start first task in background (it will be running)
    await executor.dispatch({ prompt: 'task1', mode: 'background' })
    // give it a tick to start executing
    await new Promise(r => setTimeout(r, 10))

    // second task should be rejected
    const result = await executor.dispatch({ prompt: 'task2', mode: 'sync' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Max active tasks')
  })

  it('rejects when circuit breaker is open', async () => {
    const cb = new CircuitBreaker({ enabled: true, failureThreshold: 1, resetTimeoutMs: 60_000 })
    cb.failure() // trip the breaker

    const { executor } = makeExecutor({ circuitBreaker: cb })

    const result = await executor.dispatch({ prompt: 'blocked', mode: 'sync' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Circuit breaker is open')
  })

  it('retries on failure when retryPolicy allows', async () => {
    let callCount = 0
    const { executor } = makeExecutor({
      retryPolicy: new RetryPolicy({
        enabled: true,
        maxAttempts: 3,
        backoffMs: 10,
        backoffMultiplier: 1,
      }),
      runSession: makeRunSession(() => {
        callCount++
        if (callCount < 2) {
          throw new Error(`fail ${callCount}`)
        }
        return { text: 'recovered', sessionId: 's', durationMs: 10 }
      }),
    })

    const result = await executor.dispatch({ prompt: 'retry me', mode: 'sync' })

    expect(result.success).toBe(true)
    expect(result.output).toBe('recovered')
    expect(callCount).toBe(2)
  })

  it('emits task lifecycle hooks', async () => {
    const hookRegistry = new HookRegistry()
    const events: string[] = []

    hookRegistry.on('task.created', 'test-created', () => { events.push('created') }, 0)
    hookRegistry.on('task.started', 'test-started', () => { events.push('started') }, 0)
    hookRegistry.on('task.completed', 'test-completed', () => { events.push('completed') }, 0)

    const { executor } = makeExecutor({ hookRegistry })

    await executor.dispatch({ prompt: 'hook test', mode: 'sync' })

    expect(events).toEqual(['created', 'started', 'completed'])
  })
})

describe('TaskExecutor.callAgent', () => {
  it('returns success with output text', async () => {
    const { executor } = makeExecutor({
      runSession: makeRunSession((opts) => ({
        text: `response to: ${opts.prompt}`,
        sessionId: 'agent-sess',
        durationMs: 50,
      })),
    })

    const result = await executor.callAgent('coder', 'write code', {})
    expect(result.success).toBe(true)
    expect(result.output).toBe('response to: write code')
  })

  it('uses an isolated ephemeral session and forwards agent name and slot', async () => {
    const seen: RunSessionOptions[] = []
    const { executor } = makeExecutor({
      runSession: makeRunSession((opts) => {
        seen.push(opts)
        return {
          text: 'done',
          sessionId: 'agent-call-slot',
          durationMs: 10,
        }
      }),
    })

    const result = await executor.callAgent('spec-reviewer', 'check against spec', {
      slot: 'critique',
    })

    expect(result.success).toBe(true)
    expect(seen).toEqual([{
      prompt: 'check against spec',
      sessionMode: 'ephemeral',
      agentName: 'spec-reviewer',
      slot: 'critique',
    }])
  })

  it('returns error on failure', async () => {
    const { executor } = makeExecutor({
      runSession: makeRunSession(() => { throw new Error('agent crash') }),
    })

    const result = await executor.callAgent('coder', 'fail', {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('agent crash')
  })
})

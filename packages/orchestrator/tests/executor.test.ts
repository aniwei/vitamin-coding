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
    expect(seen).toMatchObject([{
      prompt: 'review this diff',
      sessionId: 'child-review',
      sessionMode: 'sticky',
      agentName: 'quality-reviewer',
      slot: 'critique',
      sidechain: {
        parentTaskId: undefined,
        parentSessionId: undefined,
        subagent: 'quality-reviewer',
        policy: {
          returnMode: 'summary_only',
          permissionMode: 'inherit',
        },
      },
    }])
  })

  it('forwards task metadata to runSession', async () => {
    const seen: RunSessionOptions[] = []
    const { executor } = makeExecutor({
      runSession: makeRunSession((opts) => {
        seen.push(opts)
        return {
          text: 'context-applied',
          sessionId: 'ctx-sess',
          durationMs: 15,
        }
      }),
    })

    const result = await executor.dispatch({
      prompt: 'dispatch with context',
      mode: 'sync',
    })

    expect(result.success).toBe(true)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({
      prompt: 'dispatch with context',
      sessionMode: 'ephemeral',
    })
  })

  it('returns only sidechain summary to parent while storing transcript metadata', async () => {
    const { executor, taskStore } = makeExecutor({
      runSession: makeRunSession((opts) => ({
        text: 'full child transcript output that should not be returned',
        summary: 'child summary only',
        transcript: [
          { role: 'user', content: 'private child prompt' },
          { role: 'assistant', content: 'private child reasoning' },
        ],
        sessionId: 'child-sidechain',
        durationMs: 30,
      })),
    })

    const result = await executor.dispatch({
      prompt: 'inspect implementation',
      subagent: 'explorer',
      category: 'codebase',
      mode: 'sync',
      parentTaskId: 'task-parent',
      parentSessionId: 'session-parent',
      sidechain: {
        permissionMode: 'restricted',
        workspaceRoot: '/workspace/pkg',
        allowedTools: ['read', 'grep'],
        deniedTools: ['write'],
      },
    })

    expect(result).toMatchObject({
      success: true,
      output: 'child summary only',
      status: 'completed',
    })

    const task = await taskStore.get(result.id!)
    expect(task?.output).toMatchObject({
      text: 'child summary only',
      summary: 'child summary only',
    })
    expect(task?.sidechain).toMatchObject({
      isolated: true,
      parentTaskId: 'task-parent',
      parentSessionId: 'session-parent',
      childSessionId: 'child-sidechain',
      subagent: 'explorer',
      category: 'codebase',
      policy: {
        returnMode: 'summary_only',
        permissionMode: 'restricted',
        workspaceRoot: '/workspace/pkg',
        allowedTools: ['read', 'grep'],
        deniedTools: ['write'],
      },
      summary: 'child summary only',
    })
    expect(task?.sidechain?.transcript).toHaveLength(2)
  })

  it('can expose full child text when sidechain return mode opts in', async () => {
    const { executor } = makeExecutor({
      runSession: makeRunSession(() => ({
        text: 'full child output',
        summary: 'short summary',
        sessionId: 'child-full',
        durationMs: 10,
      })),
    })

    const result = await executor.dispatch({
      prompt: 'deep task',
      subagent: 'worker',
      mode: 'sync',
      sidechain: { returnMode: 'full_text' },
    })

    expect(result.output).toBe('full child output')
  })

  it('records sidechain metadata when child session fails', async () => {
    const failure = new Error('child failed') as Error & {
      sidechainSessionId?: string
      sidechainTranscript?: unknown[]
    }
    failure.sidechainSessionId = 'failed-child'
    failure.sidechainTranscript = [{ role: 'user', content: 'private child prompt' }]

    const { executor, taskStore } = makeExecutor({
      runSession: makeRunSession(() => {
        throw failure
      }),
    })

    const result = await executor.dispatch({
      prompt: 'fail child',
      subagent: 'explorer',
      mode: 'sync',
      parentTaskId: 'task-parent',
      parentSessionId: 'session-parent',
      sidechain: { permissionMode: 'restricted', allowedTools: ['read'] },
    })

    expect(result).toMatchObject({
      success: false,
      status: 'failed',
      error: 'child failed',
    })

    const task = await taskStore.get(result.id!)
    expect(task?.sidechain).toMatchObject({
      isolated: true,
      parentTaskId: 'task-parent',
      parentSessionId: 'session-parent',
      childSessionId: 'failed-child',
      subagent: 'explorer',
      policy: {
        returnMode: 'summary_only',
        permissionMode: 'restricted',
        allowedTools: ['read'],
      },
      summary: 'Sidechain task failed: child failed',
      transcript: [{ role: 'user', content: 'private child prompt' }],
    })
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

  it('aborts a running task and preserves cancelled state', async () => {
    let seenSignal: AbortSignal | undefined
    const { executor, taskStore } = makeExecutor({
      runSession: makeRunSession((opts) => {
        seenSignal = opts.signal
        return new Promise<RunSessionResult>((resolve, reject) => {
          opts.signal?.addEventListener('abort', () => {
            reject(new Error('aborted by test'))
          }, { once: true })
          setTimeout(() => {
            resolve({ text: 'late success', sessionId: 'late-session', durationMs: 100 })
          }, 100)
        })
      }),
    })

    const result = await executor.dispatch({ prompt: 'long task', mode: 'background' })
    expect(result.success).toBe(true)

    await new Promise(r => setTimeout(r, 10))
    expect(seenSignal?.aborted).toBe(false)
    expect(executor.cancelTask(result.id!)).toBe(true)
    expect(seenSignal?.aborted).toBe(true)

    await new Promise(r => setTimeout(r, 20))
    const task = await taskStore.get(result.id!)
    expect(task?.status).toBe('cancelled')

    await new Promise(r => setTimeout(r, 120))
    const latest = await taskStore.get(result.id!)
    expect(latest?.status).toBe('cancelled')
    expect(latest?.output).toBeUndefined()
  })

  it('does not retry a task that is cancelled during retry backoff', async () => {
    let callCount = 0
    const { executor, taskStore } = makeExecutor({
      retryPolicy: new RetryPolicy({
        enabled: true,
        maxAttempts: 3,
        backoffMs: 50,
        backoffMultiplier: 1,
      }),
      runSession: makeRunSession(async () => {
        callCount++
        await new Promise(r => setTimeout(r, 20))
        throw new Error('retryable failure')
      }),
    })

    const result = await executor.dispatch({ prompt: 'cancel during backoff', mode: 'background' })
    expect(result.success).toBe(true)

    await new Promise(r => setTimeout(r, 30))
    expect(executor.cancelTask(result.id!)).toBe(true)

    await new Promise(r => setTimeout(r, 80))
    const task = await taskStore.get(result.id!)
    expect(task?.status).toBe('cancelled')
    expect(callCount).toBe(1)
  })

  it('times out a sidechain task and ignores late completion', async () => {
    let seenSignal: AbortSignal | undefined
    let resolved = false
    const { executor, taskStore } = makeExecutor({
      runSession: makeRunSession((opts) => {
        seenSignal = opts.signal
        return new Promise<RunSessionResult>((resolve) => {
          setTimeout(() => {
            resolved = true
            resolve({ text: 'late success', sessionId: 'late-session', durationMs: 80 })
          }, 80)
        })
      }),
    })

    const result = await executor.dispatch({
      prompt: 'timeout child',
      subagent: 'explorer',
      mode: 'sync',
      sidechain: { timeoutMs: 20 },
    })

    expect(result).toMatchObject({
      success: false,
      status: 'failed',
      error: 'Task timed out after 20ms',
    })
    expect(seenSignal?.aborted).toBe(true)

    const task = await taskStore.get(result.id!)
    expect(task?.status).toBe('failed')
    expect(task?.error).toMatchObject({
      code: 'EXECUTION_TIMEOUT',
      message: 'Task timed out after 20ms',
      retriable: false,
    })
    expect(task?.sidechain).toMatchObject({
      policy: {
        returnMode: 'summary_only',
        permissionMode: 'inherit',
        timeoutMs: 20,
      },
      summary: 'Sidechain task timed out after 20ms',
    })

    await new Promise(r => setTimeout(r, 90))
    expect(resolved).toBe(true)
    const latest = await taskStore.get(result.id!)
    expect(latest?.status).toBe('failed')
    expect(latest?.output).toBeUndefined()
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

  it('does not create task records for direct agent calls', async () => {
    const { executor, taskStore } = makeExecutor()

    const result = await executor.callAgent('reviewer', 'inspect this change', {})

    expect(result.success).toBe(true)
    await expect(taskStore.list()).resolves.toEqual([])
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

  it('bypasses the circuit breaker gate for direct agent calls', async () => {
    const circuitBreaker = new CircuitBreaker({
      enabled: true,
      failureThreshold: 1,
      resetTimeoutMs: 60_000,
    })
    circuitBreaker.failure()

    const { executor } = makeExecutor({
      circuitBreaker,
      runSession: makeRunSession(() => ({
        text: 'review completed',
        sessionId: 'agent-open-breaker',
        durationMs: 15,
      })),
    })

    const result = await executor.callAgent('quality-reviewer', 'review this change', {})

    expect(result.success).toBe(true)
    expect(result.output).toBe('review completed')
  })

  it('does not retry failed direct agent calls', async () => {
    let callCount = 0
    const { executor } = makeExecutor({
      retryPolicy: new RetryPolicy({
        enabled: true,
        maxAttempts: 3,
        backoffMs: 1,
        backoffMultiplier: 1,
      }),
      runSession: makeRunSession(() => {
        callCount++
        throw new Error('agent crash')
      }),
    })

    const result = await executor.callAgent('coder', 'fail once', {})

    expect(result.success).toBe(false)
    expect(result.error).toContain('agent crash')
    expect(callCount).toBe(1)
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

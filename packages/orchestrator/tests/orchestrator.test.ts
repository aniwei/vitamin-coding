import { describe, expect, it } from 'vitest'
import { HookRegistry } from '@x-mars/hooks'
import { Orchestrator } from '../src/orchestrator'
import type { RunSessionOptions, RunSessionResult } from '../src/executor'

function makeRunSession(
  impl?: (opts: RunSessionOptions) => RunSessionResult | Promise<RunSessionResult>,
): (opts: RunSessionOptions) => Promise<RunSessionResult> {
  const fn = impl ?? (() => ({ text: 'ok', sessionId: 's1', durationMs: 50 }))
  return async (opts) => fn(opts)
}

describe('Orchestrator', () => {
  it('creates orchestrator with all callbacks', () => {
    const orch = new Orchestrator({
      hookRegistry: new HookRegistry(),
      runSession: makeRunSession(),
    })

    expect(orch.dispatchTask).toBeTypeOf('function')
    expect(orch.callAgent).toBeTypeOf('function')
    expect(orch.createTask).toBeTypeOf('function')
    expect(orch.getTask).toBeTypeOf('function')
    expect(orch.listTasks).toBeTypeOf('function')
    expect(orch.updateTask).toBeTypeOf('function')
    expect(orch.getBackgroundOutput).toBeTypeOf('function')
    expect(orch.cancelBackground).toBeTypeOf('function')
    expect(orch.clarifyRequest).toBeTypeOf('function')
    expect(orch.taskStore).toBeDefined()
    expect(orch.dispose).toBeTypeOf('function')
  })

  describe('createTask', () => {
    it('creates a task and returns its id', async () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession(),
      })

      const result = await orch.createTask({ prompt: 'do something', category: 'coding' })
      expect(result.success).toBe(true)
      expect(result.id).toBeDefined()

      const task = await orch.taskStore.get(result.id!)
      expect(task).toBeDefined()
      expect(task!.input.prompt).toBe('do something')
      expect(task!.input.category).toBe('coding')
    })
  })

  describe('getTask', () => {
    it('returns not_found for unknown id', async () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession(),
      })

      const result = await orch.getTask('unknown-id')
      expect(result.status).toBe('not_found')
    })

    it('returns task details', async () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession(),
      })

      const { id } = await orch.createTask({ prompt: 'test task' })
      const result = await orch.getTask(id!)
      expect(result.id).toBe(id)
      expect(result.status).toBe('pending')
      expect(result.prompt).toBe('test task')
    })

    it('maps failed status to error', async () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession(),
      })

      const { id } = await orch.createTask({ prompt: 'fail task' })
      await orch.taskStore.update(id!, {
        status: 'failed',
        error: { code: 'FAIL', message: 'broke', retriable: false },
      })

      const result = await orch.getTask(id!)
      expect(result.status).toBe('error')
      expect(result.error).toBe('broke')
    })
  })

  describe('listTasks', () => {
    it('lists all tasks', async () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession(),
      })

      await orch.createTask({ prompt: 'task 1' })
      await orch.createTask({ prompt: 'task 2' })

      const result = await orch.listTasks()
      expect(result.success).toBe(true)
      expect(result.tasks.length).toBe(2)
    })

    it('filters by status', async () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession(),
      })

      const { id: id1 } = await orch.createTask({ prompt: 'task 1' })
      await orch.createTask({ prompt: 'task 2' })
      await orch.taskStore.update(id1!, { status: 'completed' })

      const result = await orch.listTasks('pending')
      expect(result.tasks.length).toBe(1)
      expect(result.tasks[0].status).toBe('pending')
    })

    it('maps error filter to failed', async () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession(),
      })

      const { id } = await orch.createTask({ prompt: 'fail' })
      await orch.taskStore.update(id!, { status: 'failed' })

      const result = await orch.listTasks('error')
      expect(result.tasks.length).toBe(1)
      expect(result.tasks[0].status).toBe('error')
    })
  })

  describe('updateTask', () => {
    it('cancels a pending task', async () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession(),
      })

      const { id } = await orch.createTask({ prompt: 'cancel me' })
      const result = await orch.updateTask(id!, 'cancel')
      expect(result.success).toBe(true)

      const task = await orch.taskStore.get(id!)
      expect(task!.status).toBe('cancelled')
    })

    it('rejects cancel for completed task', async () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession(),
      })

      const { id } = await orch.createTask({ prompt: 'done' })
      await orch.taskStore.update(id!, { status: 'completed' })

      const result = await orch.updateTask(id!, 'cancel')
      expect(result.success).toBe(false)
    })

    it('retries a failed task', async () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession(() => ({
          text: 'retry success',
          sessionId: 's2',
          durationMs: 10,
        })),
        workflowConfig: { retry: { enabled: false } },
      })

      const { id } = await orch.createTask({ prompt: 'retry me' })
      await orch.taskStore.update(id!, {
        status: 'failed',
        error: { code: 'FAIL', message: 'first fail', retriable: true },
      })

      const result = await orch.updateTask(id!, 'retry')
      expect(result.success).toBe(true)
    })

    it('rejects retry for non-failed task', async () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession(),
      })

      const { id } = await orch.createTask({ prompt: 'pending' })
      const result = await orch.updateTask(id!, 'retry')
      expect(result.success).toBe(false)
    })

    it('returns error for unknown task', async () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession(),
      })

      const result = await orch.updateTask('no-such-id', 'cancel')
      expect(result.success).toBe(false)
    })
  })

  describe('background cancellation', () => {
    it('aborts a running background task through cancelBackground', async () => {
      let seenSignal: AbortSignal | undefined
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession((opts) => {
          seenSignal = opts.signal
          return new Promise<RunSessionResult>((resolve, reject) => {
            opts.signal?.addEventListener('abort', () => {
              reject(new Error('cancelled by orchestrator'))
            }, { once: true })
            setTimeout(() => {
              resolve({ text: 'late output', sessionId: 'late-session', durationMs: 100 })
            }, 100)
          })
        }),
      })

      const dispatched = await orch.dispatchTask({
        prompt: 'long background task',
        mode: 'background',
      })
      expect(dispatched.success).toBe(true)

      await new Promise(r => setTimeout(r, 10))
      expect(seenSignal?.aborted).toBe(false)

      const cancelled = await orch.cancelBackground(dispatched.id!)
      expect(cancelled.success).toBe(true)
      expect(seenSignal?.aborted).toBe(true)

      await new Promise(r => setTimeout(r, 20))
      const task = await orch.taskStore.get(dispatched.id!)
      expect(task?.status).toBe('cancelled')

      await new Promise(r => setTimeout(r, 120))
      const latest = await orch.taskStore.get(dispatched.id!)
      expect(latest?.status).toBe('cancelled')
      expect(latest?.output).toBeUndefined()
    })
  })

  describe('clarifyRequest', () => {
    it('routes clarification through lead agent', async () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession(() => ({
          text: 'Use blue color for the header.',
          sessionId: 's-clarify',
          durationMs: 10,
        })),
      })

      const result = await orch.clarifyRequest({ taskId: 'task_1', question: 'what color?', reason: 'missing_context' })
      expect(result.success).toBe(true)
      expect(result.answer).toContain('blue')
    })

    it('escalates on runSession failure', async () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: async () => { throw new Error('session failed') },
      })

      const result = await orch.clarifyRequest({ taskId: 'task_1', question: 'what color?' })
      expect(result.success).toBe(false)
      expect(result.escalation).toBe('lead_agent')
    })
  })

  describe('writeTodos', () => {
    it('stores and returns todos per session', async () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession(),
      })

      const first = await orch.writeTodos({
        sessionId: 'lead-1',
        action: 'set',
        todos: [{ id: 'T1', title: 'Inspect runtime wiring', status: 'pending' }],
      })

      expect(first.success).toBe(true)
      expect(first.todos).toHaveLength(1)
      expect(first.todos[0].id).toBe('T1')

      const second = await orch.writeTodos({
        sessionId: 'lead-1',
        action: 'update',
        todos: [
          { id: 'T1', title: 'Inspect runtime wiring', status: 'in_progress' },
          { id: 'T2', title: 'Patch tool callback', status: 'pending' },
        ],
      })

      expect(second.todos).toHaveLength(2)
      expect(second.todos[0].status).toBe('in_progress')
      expect(second.todos[1].id).toBe('T2')
    })

    it('isolates todos across sessions', async () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession(),
      })

      await orch.writeTodos({
        sessionId: 'lead-a',
        action: 'set',
        todos: [{ id: 'T1', title: 'Plan A', status: 'pending' }],
      })

      await orch.writeTodos({
        sessionId: 'lead-b',
        action: 'set',
        todos: [{ id: 'T1', title: 'Plan B', status: 'pending' }],
      })

      const a = await orch.writeTodos({
        sessionId: 'lead-a',
        action: 'update',
        todos: [],
      })

      expect(a.todos).toHaveLength(1)
      expect(a.todos[0].title).toBe('Plan A')
    })
  })

  describe('dispatchTask (integration)', () => {
    it('dispatches sync task through full pipeline', async () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession((opts) => ({
          text: `executed: ${opts.prompt}`,
          sessionId: 'sess-int',
          durationMs: 10,
        })),
        workflowConfig: { retry: { enabled: false } },
      })

      const result = await orch.dispatchTask({
        prompt: 'integration test',
        mode: 'sync',
      })

      expect(result.success).toBe(true)
      expect(result.output).toBe('executed: integration test')
    })
  })

  describe('dispose', () => {
    it('can be called without error', () => {
      const orch = new Orchestrator({
        hookRegistry: new HookRegistry(),
        runSession: makeRunSession(),
      })
      expect(() => orch.dispose()).not.toThrow()
    })
  })
})

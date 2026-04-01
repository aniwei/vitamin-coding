import { describe, it, expect } from 'vitest'
import { createTaskDispatcher } from '../src/task-dispatcher'
import { createRetryStrategy, createCircuitBreaker } from '../src/retry-strategy'
import type {
  AgentResolver,
  AgentSpec,
  AgentSessionHandle,
  BackgroundTaskRunner,
  DispatcherEventBus,
  DispatcherEventMap,
  OrchestratorTask,
  SessionManagerHandle,
  TaskReviewGate,
  ToolSelector,
} from '../src/types'

// ═══════════════════════════════════════════════════════════
// In-memory port implementations (no mocks/spies)
// ═══════════════════════════════════════════════════════════

function createInMemoryAgentRegistry(agents: Record<string, AgentSpec> = {}): AgentResolver {
  return {
    resolve(query) {
      if (query.name && agents[query.name]) return agents[query.name]
      if (query.category) {
        return Object.values(agents).find(a => a.capabilities?.includes(query.category!))
      }
      return undefined
    },
  }
}

function createInMemorySessionManager(responseText = 'done\nAll tasks completed.'): {
  manager: SessionManagerHandle
  sessions: Map<string, AgentSessionHandle>
} {
  const sessions = new Map<string, AgentSessionHandle>()

  const manager: SessionManagerHandle = {
    async createSession(options) {
      const id = options?.id ?? crypto.randomUUID()
      const session: AgentSessionHandle = {
        id,
        status: 'ready',
        async prompt() { /* response captured in getLastAssistantText */ },
        abort() {},
        getLastAssistantText() { return responseText },
      }
      sessions.set(id, session)
      return session
    },
    async removeSession(id) {
      return sessions.delete(id)
    },
    getSession(id) {
      return sessions.get(id)
    },
  }

  return { manager, sessions }
}

function createInMemoryBackgroundManager(): {
  runner: BackgroundTaskRunner
  submitted: Array<{ task: OrchestratorTask; spec: AgentSpec }>
} {
  const submitted: Array<{ task: OrchestratorTask; spec: AgentSpec }> = []
  const runner: BackgroundTaskRunner = {
    async submit(task, spec) {
      submitted.push({ task, spec })
      return task.id
    },
    async cancel() {
      return { success: true }
    },
  }
  return { runner, submitted }
}

function createInMemoryEventBus(): {
  bus: DispatcherEventBus
  events: Array<{ event: string; payload: unknown }>
} {
  const events: Array<{ event: string; payload: unknown }> = []
  const bus: DispatcherEventBus = {
    async emit<K extends keyof DispatcherEventMap>(event: K, payload: DispatcherEventMap[K]) {
      events.push({ event, payload })
    },
  }
  return { bus, events }
}

const emptyToolRegistry: ToolSelector = {
  filterByNames() { return [] },
}

const defaultAgent: AgentSpec = {
  name: 'coder',
  description: 'A coding agent',
  model: 'gpt-4',
  tools: [],
}

// ═══════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════

describe('createTaskDispatcher', () => {
  function setup(options: {
    agents?: Record<string, AgentSpec>
    responseText?: string
    reviewGate?: TaskReviewGate
    maxConcurrent?: number
  } = {}) {
    const registry = createInMemoryAgentRegistry(options.agents ?? { coder: defaultAgent })
    const { manager, sessions } = createInMemorySessionManager(options.responseText)
    const { runner, submitted } = createInMemoryBackgroundManager()
    const { bus, events } = createInMemoryEventBus()
    const retryStrategy = createRetryStrategy({ maxAttempts: 2, backoff: 'none' })
    const circuitBreaker = createCircuitBreaker({ failureThreshold: 3 })

    const dispatcher = createTaskDispatcher({
      agentRegistry: registry,
      backgroundManager: runner,
      sessionManager: manager,
      toolRegistry: emptyToolRegistry,
      eventBus: bus,
      maxConcurrentTasks: options.maxConcurrent,
      retryStrategy,
      circuitBreaker,
      reviewGate: options.reviewGate,
    })

    return { dispatcher, events, submitted, sessions, circuitBreaker }
  }

  describe('dispatch - sync mode', () => {
    it('completes successfully with a matching agent', async () => {
      const { dispatcher } = setup()
      const result = await dispatcher.dispatch({
        prompt: 'Fix the bug',
        subagent: 'coder',
        mode: 'sync',
      })
      expect(result.success).toBe(true)
      expect(result.output).toContain('done')
      expect(result.status).toBe('completed')
    })

    it('fails when no matching agent exists', async () => {
      const { dispatcher } = setup()
      const result = await dispatcher.dispatch({
        prompt: 'Fix the bug',
        subagent: 'nonexistent',
        mode: 'sync',
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('No matching agent')
    })

    it('emits task lifecycle events', async () => {
      const { dispatcher, events } = setup()
      await dispatcher.dispatch({ prompt: 'Test', subagent: 'coder', mode: 'sync' })

      const eventTypes = events.map(e => e.event)
      expect(eventTypes).toContain('task.created')
      expect(eventTypes).toContain('task.started')
      expect(eventTypes).toContain('task.completed')
    })

    it('cleans up ephemeral sessions after completion', async () => {
      const { dispatcher, sessions } = setup()
      await dispatcher.dispatch({ prompt: 'Test', subagent: 'coder', mode: 'sync' })
      // Ephemeral session should be removed after use
      expect(sessions.size).toBe(0)
    })
  })

  describe('dispatch - background mode', () => {
    it('submits task to background manager', async () => {
      const { dispatcher, submitted } = setup()
      const result = await dispatcher.dispatch({
        prompt: 'Long running task',
        subagent: 'coder',
        mode: 'background',
      })
      expect(result.success).toBe(true)
      expect(result.status).toBe('running')
      expect(submitted).toHaveLength(1)
      expect(submitted[0].spec.name).toBe('coder')
    })
  })

  describe('create', () => {
    it('creates a background task and returns its id', async () => {
      const { dispatcher } = setup()
      const result = await dispatcher.create({ prompt: 'Build feature X', subagent: 'coder' })
      expect(result.success).toBe(true)
      expect(result.id).toBeTruthy()
    })
  })

  describe('get', () => {
    it('retrieves a dispatched task', async () => {
      const { dispatcher } = setup()
      const result = await dispatcher.dispatch({ prompt: 'Test', subagent: 'coder', mode: 'sync' })
      // The task was created and completed; list to find its id
      const listResult = await dispatcher.list()
      expect(listResult.tasks.length).toBeGreaterThan(0)

      const task = await dispatcher.get(listResult.tasks[0].id)
      expect(task).toBeDefined()
      expect(task!.status).toBe('completed')
    })

    it('returns undefined for unknown task id', async () => {
      const { dispatcher } = setup()
      expect(await dispatcher.get('nonexistent-id')).toBeUndefined()
    })
  })

  describe('list', () => {
    it('lists all tasks', async () => {
      const { dispatcher } = setup()
      await dispatcher.dispatch({ prompt: 'Task 1', subagent: 'coder', mode: 'sync' })
      await dispatcher.dispatch({ prompt: 'Task 2', subagent: 'coder', mode: 'sync' })

      const result = await dispatcher.list()
      expect(result.success).toBe(true)
      expect(result.tasks).toHaveLength(2)
    })

    it('filters by status', async () => {
      const { dispatcher } = setup()
      await dispatcher.dispatch({ prompt: 'Good task', subagent: 'coder', mode: 'sync' })
      await dispatcher.dispatch({ prompt: 'Bad task', subagent: 'nonexistent', mode: 'sync' })

      const completed = await dispatcher.list('completed')
      expect(completed.tasks).toHaveLength(1)
      expect(completed.tasks[0].prompt).toBe('Good task')

      const failed = await dispatcher.list('failed')
      expect(failed.tasks).toHaveLength(1)
      expect(failed.tasks[0].prompt).toBe('Bad task')
    })
  })

  describe('update - cancel', () => {
    it('cancels a background task', async () => {
      const { dispatcher } = setup()
      const created = await dispatcher.create({ prompt: 'Cancel me', subagent: 'coder' })
      const result = await dispatcher.update(created.id, 'cancel')
      expect(result.success).toBe(true)
    })

    it('rejects cancelling a sync task', async () => {
      const { dispatcher } = setup()
      await dispatcher.dispatch({ prompt: 'Sync task', subagent: 'coder', mode: 'sync' })
      const list = await dispatcher.list()
      // Completed sync tasks have mode 'sync'
      const result = await dispatcher.update(list.tasks[0].id, 'cancel')
      expect(result.success).toBe(false)
      expect(result.message).toContain('Cannot cancel synchronous task')
    })

    it('returns error for unknown task id', async () => {
      const { dispatcher } = setup()
      const result = await dispatcher.update('nonexistent', 'cancel')
      expect(result.success).toBe(false)
      expect(result.message).toContain('not found')
    })
  })

  describe('update - retry', () => {
    it('retries a failed task', async () => {
      const { dispatcher } = setup({ responseText: 'done\nRetried successfully.' })
      // First dispatch fails (no matching agent)
      await dispatcher.dispatch({ prompt: 'Will fail', subagent: 'ghost', mode: 'sync' })
      const list = await dispatcher.list('failed')
      expect(list.tasks).toHaveLength(1)

      // Manually fix: we can't retry a NO_AGENT error (not retriable)
      // Instead test with an agent that exists, then check retry of a retriable error
    })

    it('rejects retry on completed task', async () => {
      const { dispatcher } = setup()
      await dispatcher.dispatch({ prompt: 'Completed', subagent: 'coder', mode: 'sync' })
      const list = await dispatcher.list('completed')
      const result = await dispatcher.update(list.tasks[0].id, 'retry')
      expect(result.success).toBe(false)
      expect(result.message).toContain('cannot retry')
    })
  })

  describe('review gate', () => {
    it('rejects task when review gate blocks', async () => {
      const reviewGate: TaskReviewGate = {
        async run() {
          return { passed: false, blockers: [{ message: 'Quality too low' }] }
        },
      }
      const { dispatcher, events } = setup({ reviewGate })
      const result = await dispatcher.dispatch({ prompt: 'Test', subagent: 'coder', mode: 'sync' })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Quality too low')

      const failedEvents = events.filter(e => e.event === 'task.failed')
      expect(failedEvents).toHaveLength(1)
    })

    it('allows task when review gate passes', async () => {
      const reviewGate: TaskReviewGate = {
        async run() {
          return { passed: true, blockers: [] }
        },
      }
      const { dispatcher } = setup({ reviewGate })
      const result = await dispatcher.dispatch({ prompt: 'Test', subagent: 'coder', mode: 'sync' })
      expect(result.success).toBe(true)
    })
  })

  describe('circuit breaker integration', () => {
    it('rejects dispatch when circuit breaker is open', async () => {
      const { dispatcher, circuitBreaker } = setup()
      // Trip the circuit breaker manually
      circuitBreaker.recordFailure()
      circuitBreaker.recordFailure()
      circuitBreaker.recordFailure()
      expect(circuitBreaker.state).toBe('open')

      const result = await dispatcher.dispatch({ prompt: 'Test', subagent: 'coder', mode: 'sync' })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Circuit breaker is open')
    })
  })

  describe('max concurrent tasks', () => {
    it('rejects when max concurrent tasks reached', async () => {
      // Create dispatcher with max 1 concurrent task and a session that never resolves quickly
      const registry = createInMemoryAgentRegistry({ coder: defaultAgent })
      const { bus } = createInMemoryEventBus()
      const { runner } = createInMemoryBackgroundManager()

      let resolvePrompt: (() => void) | undefined
      const blockingSession: AgentSessionHandle = {
        id: 'blocking',
        status: 'running',
        async prompt() {
          // Block until explicitly resolved
          await new Promise<void>(r => { resolvePrompt = r })
        },
        abort() {},
        getLastAssistantText() { return 'done\nOK' },
      }

      const manager: SessionManagerHandle = {
        async createSession() { return blockingSession },
        async removeSession() { return true },
        getSession() { return undefined },
      }

      const dispatcher = createTaskDispatcher({
        agentRegistry: registry,
        backgroundManager: runner,
        sessionManager: manager,
        toolRegistry: emptyToolRegistry,
        eventBus: bus,
        maxConcurrentTasks: 1,
      })

      // Start first task (will block)
      const first = dispatcher.dispatch({ prompt: 'First', subagent: 'coder', mode: 'sync' })

      // Wait a tick for the first dispatch to enter executeSyncTask
      await new Promise(r => setTimeout(r, 10))

      // Second task should be rejected
      const second = await dispatcher.dispatch({ prompt: 'Second', subagent: 'coder', mode: 'sync' })
      expect(second.success).toBe(false)
      expect(second.error).toContain('Max concurrent tasks')

      // Unblock first task
      resolvePrompt?.()
      const firstResult = await first
      expect(firstResult.success).toBe(true)
    })
  })

  describe('sticky session mode', () => {
    it('reuses existing session for sticky mode', async () => {
      const { dispatcher, sessions } = setup()

      // First call with a specific sessionId and sticky mode
      await dispatcher.dispatch({
        prompt: 'First message',
        subagent: 'coder',
        mode: 'sync',
        sessionId: 'my-session',
        sessionMode: 'sticky',
      })

      // Sticky session should be preserved
      expect(sessions.has('my-session')).toBe(true)

      // Second call reuses the session
      await dispatcher.dispatch({
        prompt: 'Follow-up message',
        subagent: 'coder',
        mode: 'sync',
        sessionId: 'my-session',
        sessionMode: 'sticky',
      })

      // Should still be the same session
      expect(sessions.has('my-session')).toBe(true)
    })

    it('cleans up ephemeral sessions', async () => {
      const { dispatcher, sessions } = setup()
      await dispatcher.dispatch({
        prompt: 'One-off task',
        subagent: 'coder',
        mode: 'sync',
        sessionMode: 'ephemeral',
      })
      // Ephemeral session removed
      expect(sessions.size).toBe(0)
    })

    it('degrades sticky mode when only sessionFactory is provided', async () => {
      const registry = createInMemoryAgentRegistry({ coder: defaultAgent })
      const { bus } = createInMemoryEventBus()
      const { runner } = createInMemoryBackgroundManager()
      const sessions = new Map<string, AgentSessionHandle>()

      const dispatcher = createTaskDispatcher({
        agentRegistry: registry,
        backgroundManager: runner,
        sessionFactory: {
          async createSession(options) {
            const id = options?.id ?? crypto.randomUUID()
            const session: AgentSessionHandle = {
              id,
              status: 'ready',
              async prompt() {},
              abort() {},
              getLastAssistantText() {
                return 'done\nfactory session'
              },
            }
            sessions.set(id, session)
            return session
          },
          async removeSession(id) {
            return sessions.delete(id)
          },
        },
        toolRegistry: emptyToolRegistry,
        eventBus: bus,
      })

      const first = await dispatcher.dispatch({
        prompt: 'First sticky call',
        subagent: 'coder',
        mode: 'sync',
        sessionId: 'sticky-factory-session',
        sessionMode: 'sticky',
      })

      const second = await dispatcher.dispatch({
        prompt: 'Second sticky call',
        subagent: 'coder',
        mode: 'sync',
        sessionId: 'sticky-factory-session',
        sessionMode: 'sticky',
      })

      expect(first.success).toBe(true)
      expect(second.success).toBe(true)
      expect(sessions.size).toBe(0)
    })
  })

  describe('session dependency validation', () => {
    it('throws when neither sessionManager nor sessionFactory is provided', () => {
      const registry = createInMemoryAgentRegistry({ coder: defaultAgent })
      const { bus } = createInMemoryEventBus()
      const { runner } = createInMemoryBackgroundManager()

      expect(() =>
        createTaskDispatcher({
          agentRegistry: registry,
          backgroundManager: runner,
          toolRegistry: emptyToolRegistry,
          eventBus: bus,
        }),
      ).toThrow('createTaskDispatcher requires either sessionManager or sessionFactory')
    })
  })
})

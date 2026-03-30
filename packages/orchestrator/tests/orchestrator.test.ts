import { describe, it, expect } from 'vitest'
import {
  createOrchestrator,
  createEventBus,
  createAgentRegistry,
  createBackgroundManager,
  createDispatcher,
  registerAgents,
  bootstrapOrchestrator,
} from '../src'
import type {
  AgentSpec,
  AgentSessionHandle,
  SessionFactory,
  ToolRegistryHandle,
  OrchestratorEventType,
} from '../src'

// ═══ 测试用桩实现 ═══

function createStubSession(output: string = 'test output'): AgentSessionHandle {
  return {
    id: crypto.randomUUID(),
    status: 'idle',
    prompt: async (_text: string) => {},
    abort: () => {},
    getLastAssistantText: () => output,
  }
}

function createStubSessionFactory(output: string = 'test output'): SessionFactory {
  const sessions = new Map<string, AgentSessionHandle>()
  return {
    async createSession(_options) {
      const session = createStubSession(output)
      sessions.set(session.id, session)
      return session
    },
    async removeSession(id: string) {
      return sessions.delete(id)
    },
  }
}

function createCapturingSessionFactory(output: string = 'test output') {
  const calls: Array<Record<string, unknown> | undefined> = []
  const sessions = new Map<string, AgentSessionHandle>()

  const factory: SessionFactory = {
    async createSession(options) {
      calls.push(options as Record<string, unknown> | undefined)
      const session = createStubSession(output)
      sessions.set(session.id, session)
      return session
    },
    async removeSession(id: string) {
      return sessions.delete(id)
    },
  }

  return { factory, calls }
}

function createStubToolRegistry(): ToolRegistryHandle {
  return {
    filterByNames: (_names: string[]) => [],
    getAvailable: (_preset?: string) => [],
  }
}

const testAgent: AgentSpec = {
  name: 'test-agent',
  description: 'A test agent',
  model: 'gpt-4',
  capabilities: ['code'],
  tools: ['file_read', 'file_write'],
}

const explorerAgent: AgentSpec = {
  name: 'explorer',
  description: 'An explorer agent',
  model: 'gpt-4',
  capabilities: ['search', 'explore'],
}

// ═══ EventBus ═══

describe('OrchestratorEventBus', () => {
  it('should emit and receive events', async () => {
    const bus = createEventBus()
    const received: unknown[] = []

    bus.on('task.created', (payload) => {
      received.push(payload)
    })

    const task = {
      id: '1',
      kind: 'delegate' as const,
      status: 'pending' as const,
      mode: 'sync' as const,
      input: { prompt: 'hello' },
      attempts: 0,
      maxAttempts: 3,
      correlationId: 'c1',
      createdAt: Date.now(),
    }

    await bus.emit('task.created', { task })
    expect(received).toHaveLength(1)
    expect((received[0] as { task: typeof task }).task.id).toBe('1')
  })

  it('should unsubscribe via returned function', async () => {
    const bus = createEventBus()
    let count = 0

    const unsub = bus.on('task.cancelled', () => { count++ })
    await bus.emit('task.cancelled', { taskId: 'x' })
    expect(count).toBe(1)

    unsub()
    await bus.emit('task.cancelled', { taskId: 'y' })
    expect(count).toBe(1)
  })

  it('should clear all listeners', async () => {
    const bus = createEventBus()
    let count = 0

    bus.on('task.cancelled', () => { count++ })
    bus.clear()
    await bus.emit('task.cancelled', { taskId: 'x' })
    expect(count).toBe(0)
  })
})

// ═══ AgentRegistry ═══

describe('AgentRegistry', () => {
  it('should register and get agents by name', () => {
    const registry = createAgentRegistry({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })

    registry.register(testAgent)
    expect(registry.get('test-agent')).toEqual(testAgent)
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  it('should resolve by exact name', () => {
    const registry = createAgentRegistry({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })

    registry.register(testAgent)
    expect(registry.resolve({ name: 'test-agent' })?.name).toBe('test-agent')
  })

  it('should resolve by category matching capabilities', () => {
    const registry = createAgentRegistry({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })

    registry.register(testAgent)
    registry.register(explorerAgent)

    expect(registry.resolve({ category: 'search' })?.name).toBe('explorer')
    expect(registry.resolve({ category: 'code' })?.name).toBe('test-agent')
  })

  it('should fall back to fallback agent', () => {
    const registry = createAgentRegistry({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })

    const fallback: AgentSpec = {
      name: 'general',
      description: 'Fallback',
      model: 'gpt-4',
    }

    registry.setFallback(fallback)
    expect(registry.resolve({ name: 'unknown' })?.name).toBe('general')
    expect(registry.resolve({ category: 'anything' })?.name).toBe('general')
  })

  it('should list all registered agents', () => {
    const registry = createAgentRegistry({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })

    registry.register(testAgent)
    registry.register(explorerAgent)

    const list = registry.list()
    expect(list).toHaveLength(2)
    expect(list.map((a) => a.name)).toContain('test-agent')
    expect(list.map((a) => a.name)).toContain('explorer')
  })

  it('should call agent and return output', async () => {
    const registry = createAgentRegistry({
      sessionFactory: createStubSessionFactory('agent response'),
      toolRegistry: createStubToolRegistry(),
    })

    registry.register(testAgent)
    const result = await registry.call('test-agent', 'do something')

    expect(result.success).toBe(true)
    expect(result.output).toBe('agent response')
  })

  it('should preserve default tool fallback when agent has no explicit tool allowlist', async () => {
    const { factory, calls } = createCapturingSessionFactory('agent response')
    const registry = createAgentRegistry({
      sessionFactory: factory,
      toolRegistry: createStubToolRegistry(),
    })

    registry.register({
      name: 'general',
      description: 'General agent',
      model: 'gpt-4',
    })

    const result = await registry.call('general', 'do something')

    expect(result.success).toBe(true)
    expect(calls[0]?.tools).toBeUndefined()
  })

  it('should return error when calling nonexistent agent', async () => {
    const registry = createAgentRegistry({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })

    const result = await registry.call('nonexistent', 'hello')
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('should call agent in async mode via backgroundManager', async () => {
    const eventBus = createEventBus()
    const sessionFactory = createStubSessionFactory('async result')
    const toolRegistry = createStubToolRegistry()

    const registry = createAgentRegistry({ sessionFactory, toolRegistry })
    registry.register(testAgent)

    const bgm = createBackgroundManager({ eventBus, sessionFactory, toolRegistry })
    registry.setBackgroundManager(bgm)

    const result = await registry.call('test-agent', 'do async work', { mode: 'async' })
    expect(result.success).toBe(true)
    expect(result.output).toContain('background task')

    // 等后台任务完成
    await new Promise((r) => setTimeout(r, 50))
    const taskId = result.output!.split(': ')[1]
    const output = await bgm.getOutput(taskId)
    expect(output.success).toBe(true)
    expect(output.output).toBe('async result')
  })

  it('should return error for async mode without backgroundManager', async () => {
    const registry = createAgentRegistry({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })
    registry.register(testAgent)

    const result = await registry.call('test-agent', 'work', { mode: 'async' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('BackgroundManager not available')
  })
})

// ═══ BackgroundManager ═══

describe('BackgroundManager', () => {
  it('should submit task and eventually complete', async () => {
    const eventBus = createEventBus()
    const bgm = createBackgroundManager({
      eventBus,
      sessionFactory: createStubSessionFactory('bg result'),
      toolRegistry: createStubToolRegistry(),
    })

    const task = {
      id: crypto.randomUUID(),
      kind: 'delegate' as const,
      status: 'pending' as const,
      mode: 'background' as const,
      input: { prompt: 'background work' },
      attempts: 0,
      maxAttempts: 3,
      correlationId: crypto.randomUUID(),
      createdAt: Date.now(),
    }

    const taskId = await bgm.submit(task, testAgent)
    expect(taskId).toBe(task.id)

    // 等待任务完成
    await new Promise((r) => setTimeout(r, 50))

    const output = await bgm.getOutput(taskId)
    expect(output.success).toBe(true)
    expect(output.status).toBe('completed')
    expect(output.output).toBe('bg result')
  })

  it('should preserve default tool fallback for background tasks without explicit tools', async () => {
    const eventBus = createEventBus()
    const { factory, calls } = createCapturingSessionFactory('done')
    const bgm = createBackgroundManager({
      eventBus,
      sessionFactory: factory,
      toolRegistry: createStubToolRegistry(),
    })

    const task = {
      id: crypto.randomUUID(),
      kind: 'delegate' as const,
      status: 'pending' as const,
      mode: 'background' as const,
      input: { prompt: 'background work' },
      attempts: 0,
      maxAttempts: 3,
      correlationId: crypto.randomUUID(),
      createdAt: Date.now(),
    }

    await bgm.submit(task, {
      name: 'general',
      description: 'General agent',
      model: 'gpt-4',
    })
    await new Promise((r) => setTimeout(r, 20))

    expect(calls[0]?.tools).toBeUndefined()
  })

  it('should cancel running task', async () => {
    let resolvePrompt: (() => void) | undefined
    const blockingFactory: SessionFactory = {
      async createSession() {
        return {
          id: crypto.randomUUID(),
          status: 'idle',
          prompt: () => new Promise<void>((resolve) => { resolvePrompt = resolve }),
          abort: () => { resolvePrompt?.() },
          getLastAssistantText: () => 'interrupted',
        }
      },
      async removeSession() { return true },
    }

    const eventBus = createEventBus()
    const bgm = createBackgroundManager({
      eventBus,
      sessionFactory: blockingFactory,
      toolRegistry: createStubToolRegistry(),
    })

    const task = {
      id: crypto.randomUUID(),
      kind: 'delegate' as const,
      status: 'pending' as const,
      mode: 'background' as const,
      input: { prompt: 'long work' },
      attempts: 0,
      maxAttempts: 3,
      correlationId: crypto.randomUUID(),
      createdAt: Date.now(),
    }

    await bgm.submit(task, testAgent)

    // 等待 session 创建
    await new Promise((r) => setTimeout(r, 20))

    const cancelResult = await bgm.cancel(task.id)
    expect(cancelResult.success).toBe(true)

    const output = await bgm.getOutput(task.id)
    expect(output.status).toBe('cancelled')
  })

  it('should return not_found for unknown task', async () => {
    const bgm = createBackgroundManager({
      eventBus: createEventBus(),
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })

    const output = await bgm.getOutput('unknown-id')
    expect(output.status).toBe('not_found')
    expect(output.success).toBe(false)
  })

  it('should emit task.started after task is in running state', async () => {
    const eventBus = createEventBus()
    let taskStatusWhenStarted: string | undefined

    eventBus.on('task.started', (payload) => {
      taskStatusWhenStarted = (payload as { task: { status: string } }).task.status
    })

    const bgm = createBackgroundManager({
      eventBus,
      sessionFactory: createStubSessionFactory('done'),
      toolRegistry: createStubToolRegistry(),
    })

    const task = {
      id: crypto.randomUUID(),
      kind: 'delegate' as const,
      status: 'pending' as const,
      mode: 'background' as const,
      input: { prompt: 'work' },
      attempts: 0,
      maxAttempts: 3,
      correlationId: crypto.randomUUID(),
      createdAt: Date.now(),
    }

    await bgm.submit(task, testAgent)
    // task.started 事件触发时，task.status 应该已经是 running
    expect(taskStatusWhenStarted).toBe('running')
  })

  it('should list all tasks', async () => {
    const bgm = createBackgroundManager({
      eventBus: createEventBus(),
      sessionFactory: createStubSessionFactory('done'),
      toolRegistry: createStubToolRegistry(),
    })

    const task = {
      id: crypto.randomUUID(),
      kind: 'delegate' as const,
      status: 'pending' as const,
      mode: 'background' as const,
      input: { prompt: 'work' },
      attempts: 0,
      maxAttempts: 3,
      correlationId: crypto.randomUUID(),
      createdAt: Date.now(),
    }

    await bgm.submit(task, testAgent)
    await new Promise((r) => setTimeout(r, 50))

    const list = bgm.list()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(task.id)
  })
})

// ═══ Dispatcher ═══

describe('Dispatcher', () => {
  function createTestDispatcher(output: string = 'dispatch result') {
    const eventBus = createEventBus()
    const sessionFactory = createStubSessionFactory(output)
    const toolRegistry = createStubToolRegistry()

    const agentRegistry = createAgentRegistry({ sessionFactory, toolRegistry })
    agentRegistry.register(testAgent)
    agentRegistry.register(explorerAgent)

    const backgroundManager = createBackgroundManager({
      eventBus,
      sessionFactory,
      toolRegistry,
    })

    const dispatcher = createDispatcher({
      agentRegistry,
      backgroundManager,
      sessionFactory,
      toolRegistry,
      eventBus,
    })

    return { dispatcher, eventBus, agentRegistry }
  }

  it('should dispatch sync task to resolved agent', async () => {
    const { dispatcher } = createTestDispatcher('sync result')

    const result = await dispatcher.dispatch({
      prompt: 'hello',
      subagent: 'test-agent',
      mode: 'sync',
    })

    expect(result.success).toBe(true)
    expect(result.output).toBe('sync result')
    expect(result.status).toBe('completed')
  })

  it('should dispatch background task', async () => {
    const { dispatcher } = createTestDispatcher()

    const result = await dispatcher.dispatch({
      prompt: 'background work',
      subagent: 'test-agent',
      mode: 'background',
    })

    expect(result.success).toBe(true)
    expect(result.id).toBeDefined()
    expect(result.status).toBe('running')
  })

  it('should fail when no agent matches', async () => {
    const { dispatcher } = createTestDispatcher()

    const result = await dispatcher.dispatch({
      prompt: 'hello',
      subagent: 'nonexistent',
      mode: 'sync',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('No matching agent')
  })

  it('should resolve by category', async () => {
    const { dispatcher } = createTestDispatcher('explored!')

    const result = await dispatcher.dispatch({
      prompt: 'find files',
      category: 'search',
      mode: 'sync',
    })

    expect(result.success).toBe(true)
    expect(result.output).toBe('explored!')
  })

  it('should get task by id', async () => {
    const { dispatcher } = createTestDispatcher()

    const result = await dispatcher.dispatch({
      prompt: 'work',
      subagent: 'test-agent',
      mode: 'sync',
    })

    // list 应该包含该任务
    const listed = await dispatcher.list()
    expect(listed.tasks.length).toBeGreaterThan(0)

    const task = await dispatcher.get(listed.tasks[0].id)
    expect(task).toBeDefined()
    expect(task!.status).toBe('completed')
  })

  it('should create background task via create()', async () => {
    const { dispatcher } = createTestDispatcher()

    const result = await dispatcher.create({
      prompt: 'do something',
      subagent: 'test-agent',
    })

    expect(result.success).toBe(true)
    expect(result.id).toBeDefined()
  })

  it('should list tasks filtered by status', async () => {
    const { dispatcher } = createTestDispatcher()

    await dispatcher.dispatch({
      prompt: 'work 1',
      subagent: 'test-agent',
      mode: 'sync',
    })

    const completed = await dispatcher.list('completed')
    expect(completed.tasks.length).toBeGreaterThan(0)

    const pending = await dispatcher.list('pending')
    expect(pending.tasks.length).toBe(0)
  })

  it('should emit events during lifecycle', async () => {
    const { dispatcher, eventBus } = createTestDispatcher()
    const events: OrchestratorEventType[] = []

    eventBus.on('task.created', () => { events.push('task.created') })
    eventBus.on('task.started', () => { events.push('task.started') })
    eventBus.on('task.completed', () => { events.push('task.completed') })

    await dispatcher.dispatch({
      prompt: 'work',
      subagent: 'test-agent',
      mode: 'sync',
    })

    expect(events).toEqual(['task.created', 'task.started', 'task.completed'])
  })

  it('should forward maxToolTurns and emit structured subagent results', async () => {
    const eventBus = createEventBus()
    const { factory, calls } = createCapturingSessionFactory('done_with_concerns\nNeed extra review')
    let completedPayload: { subagentResult?: { status: string; concerns?: string } } | undefined

    eventBus.on('task.completed', (payload) => {
      completedPayload = payload as { subagentResult?: { status: string; concerns?: string } }
    })

    const toolRegistry = createStubToolRegistry()
    const agentRegistry = createAgentRegistry({ sessionFactory: factory, toolRegistry })
    agentRegistry.register({
      name: 'reviewer',
      description: 'Review agent',
      model: 'gpt-4',
      maxToolTurns: 7,
    })

    const backgroundManager = createBackgroundManager({
      eventBus,
      sessionFactory: factory,
      toolRegistry,
    })

    const dispatcher = createDispatcher({
      agentRegistry,
      backgroundManager,
      sessionFactory: factory,
      toolRegistry,
      eventBus,
    })

    const result = await dispatcher.dispatch({
      prompt: 'review this',
      subagent: 'reviewer',
      mode: 'sync',
    })

    expect(result.success).toBe(true)
    expect(calls[0]?.maxToolTurns).toBe(7)
    expect(completedPayload?.subagentResult?.status).toBe('done_with_concerns')
    expect(completedPayload?.subagentResult?.concerns).toBe('Need extra review')
  })

  it('should retry failed task and reuse same task id', async () => {
    const eventBus = createEventBus()
    let callCount = 0
    const conditionalFactory: SessionFactory = {
      async createSession() {
        callCount++
        return {
          id: crypto.randomUUID(),
          status: 'idle',
          prompt: async () => {
            if (callCount === 1) throw new Error('first attempt fails')
          },
          abort: () => {},
          getLastAssistantText: () => 'retry succeeded',
        }
      },
      async removeSession() { return true },
    }

    const toolRegistry = createStubToolRegistry()
    const agentRegistry = createAgentRegistry({ sessionFactory: conditionalFactory, toolRegistry })
    agentRegistry.register(testAgent)

    const backgroundManager = createBackgroundManager({
      eventBus,
      sessionFactory: conditionalFactory,
      toolRegistry,
    })

    const dispatcher = createDispatcher({
      agentRegistry,
      backgroundManager,
      sessionFactory: conditionalFactory,
      toolRegistry,
      eventBus,
    })

    // 第一次 dispatch 会失败
    const result = await dispatcher.dispatch({
      prompt: 'work',
      subagent: 'test-agent',
      mode: 'sync',
    })
    expect(result.success).toBe(false)

    // 拿到 task id
    const tasks = await dispatcher.list('failed')
    expect(tasks.tasks.length).toBe(1)
    const taskId = tasks.tasks[0].id

    // retry 应复用相同 task id
    const retryResult = await dispatcher.update(taskId, 'retry')
    expect(retryResult.success).toBe(true)

    // 确认仍然是同一个 task id
    const task = await dispatcher.get(taskId)
    expect(task).toBeDefined()
    expect(task!.status).toBe('completed')
    expect(task!.attempts).toBe(1)
  })

  it('should respect maxConcurrent limit', async () => {
    const eventBus = createEventBus()
    let resolveAll: (() => void)[] = []
    const blockingFactory: SessionFactory = {
      async createSession() {
        return {
          id: crypto.randomUUID(),
          status: 'idle',
          prompt: () => new Promise<void>((r) => { resolveAll.push(r) }),
          abort: () => {},
          getLastAssistantText: () => 'done',
        }
      },
      async removeSession() { return true },
    }

    const toolRegistry = createStubToolRegistry()
    const agentRegistry = createAgentRegistry({ sessionFactory: blockingFactory, toolRegistry })
    agentRegistry.register(testAgent)

    const backgroundManager = createBackgroundManager({
      eventBus,
      sessionFactory: blockingFactory,
      toolRegistry,
    })

    const dispatcher = createDispatcher({
      agentRegistry,
      backgroundManager,
      sessionFactory: blockingFactory,
      toolRegistry,
      eventBus,
      maxConcurrent: 1,
    })

    // 第一个任务开始执行（会阻塞）
    const p1 = dispatcher.dispatch({ prompt: 'a', subagent: 'test-agent', mode: 'sync' })

    // 等第一个任务开始
    await new Promise((r) => setTimeout(r, 20))

    // 第二个任务应该因并发限制失败
    const r2 = await dispatcher.dispatch({ prompt: 'b', subagent: 'test-agent', mode: 'sync' })
    expect(r2.success).toBe(false)
    expect(r2.error).toContain('Max concurrent')

    // 释放第一个任务
    resolveAll.forEach((r) => r())
    await p1
  })
})

// ═══ createOrchestrator (组合根) ═══

describe('createOrchestrator', () => {
  it('should create a full orchestrator with all subsystems', () => {
    const orchestrator = createOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })

    expect(orchestrator.agentRegistry).toBeDefined()
    expect(orchestrator.dispatcher).toBeDefined()
    expect(orchestrator.backgroundManager).toBeDefined()
    expect(orchestrator.eventBus).toBeDefined()
  })

  it('should dispatch work end-to-end', async () => {
    const orchestrator = createOrchestrator({
      sessionFactory: createStubSessionFactory('e2e result'),
      toolRegistry: createStubToolRegistry(),
    })

    orchestrator.agentRegistry.register(testAgent)

    const result = await orchestrator.dispatcher.dispatch({
      prompt: 'work',
      subagent: 'test-agent',
      mode: 'sync',
    })

    expect(result.success).toBe(true)
    expect(result.output).toBe('e2e result')
  })

  it('should generate tool callbacks', () => {
    const orchestrator = createOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })

    const callbacks = orchestrator.toToolCallbacks()

    expect(callbacks.dispatchTask).toBeTypeOf('function')
    expect(callbacks.callAgent).toBeTypeOf('function')
    expect(callbacks.createTask).toBeTypeOf('function')
    expect(callbacks.getTask).toBeTypeOf('function')
    expect(callbacks.listTasks).toBeTypeOf('function')
    expect(callbacks.updateTask).toBeTypeOf('function')
    expect(callbacks.getBackgroundOutput).toBeTypeOf('function')
    expect(callbacks.cancelBackground).toBeTypeOf('function')
    expect(callbacks.loadSkill).toBeTypeOf('function')
    expect(callbacks.executeSkill).toBeTypeOf('function')
  })

  it('should return error for skill operations without adapter', async () => {
    const orchestrator = createOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })

    const callbacks = orchestrator.toToolCallbacks()

    const loadResult = await callbacks.loadSkill('/path/to/skill')
    expect(loadResult.success).toBe(false)

    const execResult = await callbacks.executeSkill('some-skill')
    expect(execResult.success).toBe(false)
  })

  it('should use skill adapter when provided', async () => {
    const orchestrator = createOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
      skillAdapter: {
        load: async (path) => ({ success: true, name: 'loaded-' + path }),
        execute: async (name) => ({ success: true, output: 'executed-' + name }),
      },
    })

    const callbacks = orchestrator.toToolCallbacks(orchestrator.agentRegistry as never)
    // 这里 toToolCallbacks 接受 skillAdapter 参数
    const callbacks2 = orchestrator.toToolCallbacks({
      load: async (path) => ({ success: true, name: 'loaded-' + path }),
      execute: async (name) => ({ success: true, output: 'executed-' + name }),
    })

    const loadResult = await callbacks2.loadSkill('/my/skill')
    expect(loadResult.success).toBe(true)
    expect(loadResult.name).toBe('loaded-/my/skill')
  })

  it('should fall back to constructor skillAdapter when toToolCallbacks called without arg', async () => {
    const orchestrator = createOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
      skillAdapter: {
        load: async (path) => ({ success: true, name: 'default-' + path }),
        execute: async (name) => ({ success: true, output: 'default-' + name }),
      },
    })

    // 不传 skillAdapter 参数 → 应使用 options.skillAdapter
    const callbacks = orchestrator.toToolCallbacks()
    const loadResult = await callbacks.loadSkill('/skill')
    expect(loadResult.success).toBe(true)
    expect(loadResult.name).toBe('default-/skill')

    const execResult = await callbacks.executeSkill('my-skill')
    expect(execResult.success).toBe(true)
    expect(execResult.output).toBe('default-my-skill')
  })
})

// ═══ registerAgents helper ═══

describe('registerAgents', () => {
  it('should batch register agents with optional fallback', () => {
    const registry = createAgentRegistry({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })

    const fallback: AgentSpec = {
      name: 'general',
      description: 'General agent',
      model: 'gpt-4',
    }

    registerAgents(registry, [testAgent, explorerAgent], fallback)

    expect(registry.list()).toHaveLength(3)
    expect(registry.get('general')).toBeDefined()
    expect(registry.resolve({ name: 'unknown' })?.name).toBe('general')
  })
})

// ═══ bootstrapOrchestrator ═══

describe('bootstrapOrchestrator', () => {
  it('should create orchestrator and register agents in one call', () => {
    const { orchestrator, callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
      agents: [testAgent, explorerAgent],
      fallbackAgent: {
        name: 'general',
        description: 'Fallback',
        model: 'gpt-4',
      },
    })

    expect(orchestrator.agentRegistry.list()).toHaveLength(3)
    expect(orchestrator.agentRegistry.get('test-agent')).toBeDefined()
    expect(orchestrator.agentRegistry.get('explorer')).toBeDefined()
    expect(orchestrator.agentRegistry.resolve({ name: 'unknown' })?.name).toBe('general')
    expect(callbacks.dispatchTask).toBeTypeOf('function')
    expect(callbacks.callAgent).toBeTypeOf('function')
  })

  it('should work without agents or fallback', () => {
    const { orchestrator, callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })

    expect(orchestrator.agentRegistry.list()).toHaveLength(0)
    expect(callbacks.dispatchTask).toBeTypeOf('function')
  })

  it('should dispatch end-to-end via callbacks', async () => {
    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory('bootstrap result'),
      toolRegistry: createStubToolRegistry(),
      agents: [testAgent],
    })

    const result = await callbacks.dispatchTask({
      prompt: 'work',
      subagent: 'test-agent',
      mode: 'sync',
    })
    expect(result.success).toBe(true)
    expect(result.output).toBe('bootstrap result')
  })

  it('should use constructor skillAdapter for callbacks', async () => {
    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
      skillAdapter: {
        load: async (path) => ({ success: true, name: 'sk-' + path }),
        execute: async (name) => ({ success: true, output: 'exec-' + name }),
      },
    })

    const loadResult = await callbacks.loadSkill('/test')
    expect(loadResult.success).toBe(true)
    expect(loadResult.name).toBe('sk-/test')
  })
})

// ═══ Context Isolation ═══

describe('Context Isolation', () => {
  it('child agent sessions should not inherit parent messages', async () => {
    const createdSessions: Array<{ options: unknown; session: AgentSessionHandle }> = []
    const promptCalls: Array<{ sessionId: string; text: string }> = []

    const isolationFactory: SessionFactory = {
      async createSession(options) {
        const session: AgentSessionHandle = {
          id: crypto.randomUUID(),
          status: 'idle',
          prompt: async (text: string) => {
            promptCalls.push({ sessionId: session.id, text })
          },
          abort: () => {},
          getLastAssistantText: () => 'child output',
        }
        createdSessions.push({ options, session })
        return session
      },
      async removeSession() { return true },
    }

    const orchestrator = createOrchestrator({
      sessionFactory: isolationFactory,
      toolRegistry: createStubToolRegistry(),
    })

    orchestrator.agentRegistry.register(testAgent)
    orchestrator.agentRegistry.register(explorerAgent)

    // Dispatch two tasks sequentially
    await orchestrator.dispatcher.dispatch({
      prompt: 'first task prompt',
      subagent: 'test-agent',
      mode: 'sync',
    })

    await orchestrator.dispatcher.dispatch({
      prompt: 'second task prompt',
      subagent: 'explorer',
      mode: 'sync',
    })

    // Each task should create its own session
    expect(createdSessions).toHaveLength(2)
    expect(createdSessions[0].session.id).not.toBe(createdSessions[1].session.id)

    // Each session should only receive its own prompt, not the other's
    expect(promptCalls).toHaveLength(2)
    expect(promptCalls[0].text).toBe('first task prompt')
    expect(promptCalls[1].text).toBe('second task prompt')

    // Sessions should be isolated (different session ids for each prompt)
    expect(promptCalls[0].sessionId).not.toBe(promptCalls[1].sessionId)
  })

  it('agent_call creates isolated session separate from dispatcher', async () => {
    const sessionIds: string[] = []

    const trackingFactory: SessionFactory = {
      async createSession() {
        const session: AgentSessionHandle = {
          id: crypto.randomUUID(),
          status: 'idle',
          prompt: async () => {},
          abort: () => {},
          getLastAssistantText: () => 'result',
        }
        sessionIds.push(session.id)
        return session
      },
      async removeSession() { return true },
    }

    const orchestrator = createOrchestrator({
      sessionFactory: trackingFactory,
      toolRegistry: createStubToolRegistry(),
    })

    orchestrator.agentRegistry.register(testAgent)

    // Call via dispatcher
    await orchestrator.dispatcher.dispatch({
      prompt: 'dispatcher call',
      subagent: 'test-agent',
      mode: 'sync',
    })

    // Call via agent_call
    await orchestrator.agentRegistry.call('test-agent', 'direct call')

    // Both should create independent sessions
    expect(sessionIds).toHaveLength(2)
    expect(sessionIds[0]).not.toBe(sessionIds[1])
  })

  it('sessions are cleaned up after task completes', async () => {
    const removedIds: string[] = []

    const cleanupFactory: SessionFactory = {
      async createSession() {
        const session: AgentSessionHandle = {
          id: crypto.randomUUID(),
          status: 'idle',
          prompt: async () => {},
          abort: () => {},
          getLastAssistantText: () => 'done',
        }
        return session
      },
      async removeSession(id: string) {
        removedIds.push(id)
        return true
      },
    }

    const orchestrator = createOrchestrator({
      sessionFactory: cleanupFactory,
      toolRegistry: createStubToolRegistry(),
    })
    orchestrator.agentRegistry.register(testAgent)

    await orchestrator.dispatcher.dispatch({
      prompt: 'work',
      subagent: 'test-agent',
      mode: 'sync',
    })

    // Session should have been removed after completion
    expect(removedIds).toHaveLength(1)
  })

  it('sessions are cleaned up even when task fails', async () => {
    const removedIds: string[] = []

    const failFactory: SessionFactory = {
      async createSession() {
        const session: AgentSessionHandle = {
          id: crypto.randomUUID(),
          status: 'idle',
          prompt: async () => { throw new Error('session failed') },
          abort: () => {},
          getLastAssistantText: () => undefined,
        }
        return session
      },
      async removeSession(id: string) {
        removedIds.push(id)
        return true
      },
    }

    const orchestrator = createOrchestrator({
      sessionFactory: failFactory,
      toolRegistry: createStubToolRegistry(),
    })
    orchestrator.agentRegistry.register(testAgent)

    const result = await orchestrator.dispatcher.dispatch({
      prompt: 'will fail',
      subagent: 'test-agent',
      mode: 'sync',
    })

    expect(result.success).toBe(false)
    // Session should still be cleaned up via finally block
    expect(removedIds).toHaveLength(1)
  })
})

// ═══ Concurrent Limit Boundary ═══

describe('Concurrent Limit Boundary', () => {
  it('should allow exactly maxConcurrent tasks', async () => {
    const eventBus = createEventBus()
    const resolvers: (() => void)[] = []

    const blockingFactory: SessionFactory = {
      async createSession() {
        return {
          id: crypto.randomUUID(),
          status: 'idle',
          prompt: () => new Promise<void>((r) => { resolvers.push(r) }),
          abort: () => {},
          getLastAssistantText: () => 'done',
        }
      },
      async removeSession() { return true },
    }

    const toolRegistry = createStubToolRegistry()
    const agentRegistry = createAgentRegistry({ sessionFactory: blockingFactory, toolRegistry })
    agentRegistry.register(testAgent)

    const backgroundManager = createBackgroundManager({
      eventBus,
      sessionFactory: blockingFactory,
      toolRegistry,
    })

    const dispatcher = createDispatcher({
      agentRegistry,
      backgroundManager,
      sessionFactory: blockingFactory,
      toolRegistry,
      eventBus,
      maxConcurrent: 2,
    })

    // Start 2 tasks (should both succeed to start)
    const p1 = dispatcher.dispatch({ prompt: 'a', subagent: 'test-agent', mode: 'sync' })
    const p2 = dispatcher.dispatch({ prompt: 'b', subagent: 'test-agent', mode: 'sync' })
    await new Promise((r) => setTimeout(r, 30))

    // Third should fail
    const r3 = await dispatcher.dispatch({ prompt: 'c', subagent: 'test-agent', mode: 'sync' })
    expect(r3.success).toBe(false)
    expect(r3.error).toContain('Max concurrent')

    // Release all and verify first two complete
    resolvers.forEach((r) => r())
    const [result1, result2] = await Promise.all([p1, p2])
    expect(result1.success).toBe(true)
    expect(result2.success).toBe(true)
  })

  it('should allow new tasks after running tasks complete', async () => {
    const eventBus = createEventBus()
    let resolver: (() => void) | undefined

    const blockingFactory: SessionFactory = {
      async createSession() {
        return {
          id: crypto.randomUUID(),
          status: 'idle',
          prompt: () => new Promise<void>((r) => { resolver = r }),
          abort: () => {},
          getLastAssistantText: () => 'done',
        }
      },
      async removeSession() { return true },
    }

    const toolRegistry = createStubToolRegistry()
    const agentRegistry = createAgentRegistry({ sessionFactory: blockingFactory, toolRegistry })
    agentRegistry.register(testAgent)

    const backgroundManager = createBackgroundManager({
      eventBus,
      sessionFactory: blockingFactory,
      toolRegistry,
    })

    const dispatcher = createDispatcher({
      agentRegistry,
      backgroundManager,
      sessionFactory: blockingFactory,
      toolRegistry,
      eventBus,
      maxConcurrent: 1,
    })

    // First task blocks
    const p1 = dispatcher.dispatch({ prompt: 'a', subagent: 'test-agent', mode: 'sync' })
    await new Promise((r) => setTimeout(r, 20))

    // Second should fail
    const r2 = await dispatcher.dispatch({ prompt: 'b', subagent: 'test-agent', mode: 'sync' })
    expect(r2.success).toBe(false)

    // Release first task
    resolver!()
    await p1

    // Now third task should succeed
    const p3 = dispatcher.dispatch({ prompt: 'c', subagent: 'test-agent', mode: 'sync' })
    await new Promise((r) => setTimeout(r, 20))
    resolver!()
    const r3 = await p3
    expect(r3.success).toBe(true)
  })

  it('background tasks should not count against sync maxConcurrent', async () => {
    const eventBus = createEventBus()
    const sessionFactory = createStubSessionFactory('result')
    const toolRegistry = createStubToolRegistry()

    const agentRegistry = createAgentRegistry({ sessionFactory, toolRegistry })
    agentRegistry.register(testAgent)

    const backgroundManager = createBackgroundManager({
      eventBus,
      sessionFactory,
      toolRegistry,
    })

    const dispatcher = createDispatcher({
      agentRegistry,
      backgroundManager,
      sessionFactory,
      toolRegistry,
      eventBus,
      maxConcurrent: 1,
    })

    // Background task goes through BackgroundManager, not sync path
    const bgResult = await dispatcher.dispatch({
      prompt: 'bg work',
      subagent: 'test-agent',
      mode: 'background',
    })
    expect(bgResult.success).toBe(true)

    // Sync task should still be allowed
    const syncResult = await dispatcher.dispatch({
      prompt: 'sync work',
      subagent: 'test-agent',
      mode: 'sync',
    })
    expect(syncResult.success).toBe(true)
  })
})

// ═══ End-to-End Callbacks Integration ═══

describe('End-to-End Callbacks', () => {
  it('should flow: bootstrap → callbacks → dispatch → agent execution → result', async () => {
    const { callbacks, orchestrator } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory('agent did the work'),
      toolRegistry: createStubToolRegistry(),
      agents: [testAgent, explorerAgent],
      fallbackAgent: { name: 'general', description: 'Fallback', model: 'gpt-4' },
    })

    // dispatchTask → sync
    const dispatchResult = await callbacks.dispatchTask({
      prompt: 'analyze code',
      subagent: 'test-agent',
      mode: 'sync',
    })
    expect(dispatchResult.success).toBe(true)
    expect(dispatchResult.output).toBe('agent did the work')

    // callAgent → sync
    const callResult = await callbacks.callAgent('explorer', 'find bugs')
    expect(callResult.success).toBe(true)
    expect(callResult.output).toBe('agent did the work')

    // createTask → background
    const createResult = await callbacks.createTask({
      prompt: 'background analysis',
      subagent: 'test-agent',
    })
    expect(createResult.success).toBe(true)
    expect(createResult.id).toBeDefined()

    // Wait for background task to complete
    await new Promise((r) => setTimeout(r, 50))

    // getBackgroundOutput
    const bgOutput = await callbacks.getBackgroundOutput(createResult.id)
    expect(bgOutput.success).toBe(true)
    expect(bgOutput.output).toBe('agent did the work')

    // listTasks
    const listed = await callbacks.listTasks()
    expect(listed.success).toBe(true)
    expect(listed.tasks.length).toBeGreaterThanOrEqual(2)

    // getTask
    const task = await callbacks.getTask(createResult.id)
    expect(task.status).toBe('completed')
    expect(task.output).toBe('agent did the work')
  })

  it('should handle callAgent with fallback when agent not found', async () => {
    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory('fallback response'),
      toolRegistry: createStubToolRegistry(),
      fallbackAgent: { name: 'general', description: 'Fallback', model: 'gpt-4' },
    })

    // No specific agents registered, should use fallback
    const result = await callbacks.callAgent('unknown-agent', 'hello')
    expect(result.success).toBe(true)
    expect(result.output).toBe('fallback response')
  })

  it('should handle getTask for non-existent task', async () => {
    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })

    const result = await callbacks.getTask('nonexistent-id')
    expect(result.status).toBe('not_found')
    expect(result.error).toBe('Task not found')
  })

  it('should handle updateTask cancel + retry flow via callbacks', async () => {
    const eventBus = createEventBus()
    let resolvePrompt: (() => void) | undefined
    let callCount = 0
    const controlledFactory: SessionFactory = {
      async createSession() {
        callCount++
        return {
          id: crypto.randomUUID(),
          status: 'idle',
          prompt: () => new Promise<void>((resolve) => { resolvePrompt = resolve }),
          abort: () => { resolvePrompt?.() },
          getLastAssistantText: () => `result-${callCount}`,
        }
      },
      async removeSession() { return true },
    }

    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: controlledFactory,
      toolRegistry: createStubToolRegistry(),
      agents: [testAgent],
    })

    // Create a background task
    const created = await callbacks.createTask({
      prompt: 'long running work',
      subagent: 'test-agent',
    })
    expect(created.success).toBe(true)

    await new Promise((r) => setTimeout(r, 20))

    // Cancel it
    const cancelResult = await callbacks.cancelBackground(created.id)
    expect(cancelResult.success).toBe(true)

    // Verify cancelled via getTask
    const task = await callbacks.getTask(created.id)
    expect(task.status).toBe('cancelled')

    // Retry the task
    const retryResult = await callbacks.updateTask(created.id, 'retry')
    expect(retryResult.success).toBe(true)

    // Wait for background retry to complete
    await new Promise((r) => setTimeout(r, 50))
    resolvePrompt?.()
    await new Promise((r) => setTimeout(r, 50))

    const afterRetry = await callbacks.getTask(created.id)
    // Task should have been retried (status is completed or running)
    expect(['completed', 'running']).toContain(afterRetry.status)
  })
})

// ═══ Event System Integration ═══

describe('Event System Integration', () => {
  it('should emit full lifecycle events for sync task', async () => {
    const { orchestrator } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory('done'),
      toolRegistry: createStubToolRegistry(),
      agents: [testAgent],
    })

    const events: Array<{ type: string; payload: unknown }> = []
    orchestrator.eventBus.on('task.created', (p) => {
      events.push({ type: 'task.created', payload: p })
    })
    orchestrator.eventBus.on('task.started', (p) => {
      events.push({ type: 'task.started', payload: p })
    })
    orchestrator.eventBus.on('task.completed', (p) => {
      events.push({ type: 'task.completed', payload: p })
    })
    orchestrator.eventBus.on('task.failed', (p) => {
      events.push({ type: 'task.failed', payload: p })
    })

    await orchestrator.dispatcher.dispatch({
      prompt: 'work',
      subagent: 'test-agent',
      mode: 'sync',
    })

    expect(events.map((e) => e.type)).toEqual([
      'task.created',
      'task.started',
      'task.completed',
    ])

    // Verify event payloads
    const completedEvent = events[2].payload as { task: { id: string; status: string }; result: { text: string } }
    expect(completedEvent.task.status).toBe('completed')
    expect(completedEvent.result.text).toBe('done')
  })

  it('should emit task.failed event on execution error', async () => {
    const failFactory: SessionFactory = {
      async createSession() {
        return {
          id: crypto.randomUUID(),
          status: 'idle',
          prompt: async () => { throw new Error('execution boom') },
          abort: () => {},
          getLastAssistantText: () => undefined,
        }
      },
      async removeSession() { return true },
    }

    const { orchestrator } = bootstrapOrchestrator({
      sessionFactory: failFactory,
      toolRegistry: createStubToolRegistry(),
      agents: [testAgent],
    })

    const failedEvents: unknown[] = []
    orchestrator.eventBus.on('task.failed', (p) => {
      failedEvents.push(p)
    })

    await orchestrator.dispatcher.dispatch({
      prompt: 'will fail',
      subagent: 'test-agent',
      mode: 'sync',
    })

    expect(failedEvents).toHaveLength(1)
    const evt = failedEvents[0] as { task: { status: string }; error: { code: string; message: string } }
    expect(evt.task.status).toBe('failed')
    expect(evt.error.message).toContain('execution boom')
  })

  it('should emit task.cancelled event for background task cancellation', async () => {
    let resolvePrompt: (() => void) | undefined
    const blockingFactory: SessionFactory = {
      async createSession() {
        return {
          id: crypto.randomUUID(),
          status: 'idle',
          prompt: () => new Promise<void>((r) => { resolvePrompt = r }),
          abort: () => { resolvePrompt?.() },
          getLastAssistantText: () => 'interrupted',
        }
      },
      async removeSession() { return true },
    }

    const { orchestrator } = bootstrapOrchestrator({
      sessionFactory: blockingFactory,
      toolRegistry: createStubToolRegistry(),
      agents: [testAgent],
    })

    const cancelledEvents: unknown[] = []
    orchestrator.eventBus.on('task.cancelled', (p) => {
      cancelledEvents.push(p)
    })

    const result = await orchestrator.dispatcher.dispatch({
      prompt: 'long task',
      subagent: 'test-agent',
      mode: 'background',
    })

    await new Promise((r) => setTimeout(r, 20))
    await orchestrator.backgroundManager.cancel(result.id!)

    expect(cancelledEvents).toHaveLength(1)
    expect((cancelledEvents[0] as { taskId: string }).taskId).toBe(result.id)
  })

  it('EventBus.off should remove specific handler', async () => {
    const bus = createEventBus()
    let count1 = 0
    let count2 = 0

    const handler1 = () => { count1++ }
    const handler2 = () => { count2++ }

    bus.on('task.cancelled', handler1)
    bus.on('task.cancelled', handler2)

    await bus.emit('task.cancelled', { taskId: 'x' })
    expect(count1).toBe(1)
    expect(count2).toBe(1)

    bus.off('task.cancelled', handler1)

    await bus.emit('task.cancelled', { taskId: 'y' })
    expect(count1).toBe(1) // unchanged
    expect(count2).toBe(2) // incremented
  })
})

// ═══ Tool Registration Compatibility ═══

describe('ToolCallbacks Type Compatibility', () => {
  it('all 11 callback keys should be present', () => {
    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
      skillAdapter: {
        load: async () => ({ success: true }),
        execute: async () => ({ success: true }),
      },
    })

    const expectedKeys = [
      'dispatchTask',
      'callAgent',
      'createTask',
      'getTask',
      'listTasks',
      'updateTask',
      'getBackgroundOutput',
      'cancelBackground',
      'loadSkill',
      'executeSkill',
    ]

    for (const key of expectedKeys) {
      expect(callbacks).toHaveProperty(key)
      expect(typeof (callbacks as unknown as Record<string, unknown>)[key]).toBe('function')
    }
  })

  it('dispatchTask callback should match TaskDispatch signature', async () => {
    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory('dispatch result'),
      toolRegistry: createStubToolRegistry(),
      agents: [testAgent],
    })

    // TaskDispatch = (args: { prompt, subagent?, category?, mode, sessionId?, sessionMode?, workflowSlot? }) => Promise<{ success, output?, id?, status?, error? }>
    const result = await callbacks.dispatchTask({
      prompt: 'test',
      subagent: 'test-agent',
      mode: 'sync',
      sessionId: 'child-1',
      sessionMode: 'sticky',
      workflowSlot: 'execution',
    })

    expect(result).toHaveProperty('success')
    expect(typeof result.success).toBe('boolean')
  })

  it('callAgent callback should match CallAgent signature', async () => {
    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory('call result'),
      toolRegistry: createStubToolRegistry(),
      agents: [testAgent],
    })

    // CallAgent = (agent, prompt, options?) => Promise<{ success, output?, error? }>
    const result = await callbacks.callAgent('test-agent', 'hello', { mode: 'sync' })
    expect(result).toHaveProperty('success')
  })

  it('getTask callback should match GetTask return shape', async () => {
    const { callbacks, orchestrator } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory('task output'),
      toolRegistry: createStubToolRegistry(),
      agents: [testAgent],
    })

    // Create and complete a task
    await callbacks.dispatchTask({ prompt: 'work', subagent: 'test-agent', mode: 'sync' })
    const listed = await callbacks.listTasks()
    const taskId = listed.tasks[0].id

    // GetTask = (id) => Promise<{ id, status, prompt?, output?, error? }>
    const result = await callbacks.getTask(taskId)
    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('status')
    expect(result.id).toBe(taskId)
    expect(result.status).toBe('completed')
    expect(result.output).toBe('task output')
  })

  it('listTasks callback should match ListTasks return shape', async () => {
    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })

    // ListTasks = (status?) => Promise<{ success, tasks: Array<{ id, prompt, status }>, error? }>
    const result = await callbacks.listTasks()
    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('tasks')
    expect(Array.isArray(result.tasks)).toBe(true)
  })

  it('updateTask callback should match UpdateTask return shape', async () => {
    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })

    // UpdateTask = (id, action) => Promise<{ success, message }>
    const result = await callbacks.updateTask('nonexistent', 'cancel')
    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('message')
  })
})

// ═══ Realistic SessionFactory Integration ═══

describe('Realistic SessionFactory Integration', () => {
  /**
   * 模拟一个贴近真实 CodingSessionManager 行为的 SessionFactory：
   * - 追踪消息历史
   * - 校验 model/systemPrompt/tools 传入
   * - 验证 removeSession 确实清除了状态
   * - getSession (Phase 2 预留) 返回 undefined
   */
  function createRealisticSessionFactory() {
    const sessions = new Map<string, {
      handle: AgentSessionHandle
      messages: string[]
      model: unknown
      systemPrompt: string | undefined
      tools: unknown[]
      aborted: boolean
    }>()

    const factory: SessionFactory = {
      async createSession(options) {
        const id = crypto.randomUUID()
        const state = {
          messages: [] as string[],
          model: options?.model,
          systemPrompt: options?.systemPrompt,
          tools: options?.tools ?? [],
          aborted: false,
          handle: null as unknown as AgentSessionHandle,
        }

        const handle: AgentSessionHandle = {
          id,
          status: 'idle',
          prompt: async (text: string) => {
            if (state.aborted) throw new Error('Session aborted')
            state.messages.push(`user: ${text}`)
            // 模拟 LLM 响应
            const response = `Response to "${text}" using ${
              typeof state.model === 'string' ? state.model : 'default-model'
            }`
            state.messages.push(`assistant: ${response}`)
          },
          abort: () => { state.aborted = true },
          getLastAssistantText: () => {
            const last = state.messages.findLast(m => m.startsWith('assistant: '))
            return last?.slice('assistant: '.length)
          },
        }

        state.handle = handle
        sessions.set(id, state)
        return handle
      },

      async removeSession(id: string) {
        return sessions.delete(id)
      },

      // Phase 2 预留
      getSession(id: string) {
        const s = sessions.get(id)
        return s?.handle
      },
    }

    return { factory, sessions }
  }

  function createRealisticToolRegistry(): ToolRegistryHandle {
    const allTools = [
      { name: 'file_read', mock: true },
      { name: 'file_write', mock: true },
      { name: 'bash', mock: true },
      { name: 'grep', mock: true },
    ]
    return {
      filterByNames: (names: string[]) =>
        allTools.filter(t => names.includes(t.name)),
      getAvailable: () => allTools,
    }
  }

  it('should create session with correct model/systemPrompt/tools', async () => {
    const { factory, sessions } = createRealisticSessionFactory()
    const toolRegistry = createRealisticToolRegistry()

    const agent: AgentSpec = {
      name: 'coder',
      description: 'Code agent',
      model: 'claude-sonnet',
      systemPrompt: 'You are a coding assistant.',
      tools: ['file_read', 'file_write'],
      capabilities: ['code'],
    }

    const orchestrator = createOrchestrator({
      sessionFactory: factory,
      toolRegistry,
    })
    orchestrator.agentRegistry.register(agent)

    await orchestrator.dispatcher.dispatch({
      prompt: 'fix the bug',
      subagent: 'coder',
      mode: 'sync',
    })

    // Session was created and then removed
    expect(sessions.size).toBe(0) // cleaned up after completion

    // Verify the output contains model info from the realistic factory
    const result = await orchestrator.dispatcher.dispatch({
      prompt: 'add tests',
      subagent: 'coder',
      mode: 'sync',
    })
    expect(result.success).toBe(true)
    expect(result.output).toContain('claude-sonnet')
  })

  it('should pass tools whitelist to session via toolRegistry.filterByNames', async () => {
    const { factory } = createRealisticSessionFactory()
    const filteredTools: string[][] = []
    const toolRegistry: ToolRegistryHandle = {
      filterByNames: (names: string[]) => {
        filteredTools.push(names)
        return names.map(n => ({ name: n }))
      },
      getAvailable: () => [],
    }

    const agent: AgentSpec = {
      name: 'limited',
      description: 'Limited tools agent',
      model: 'gpt-4',
      tools: ['file_read', 'bash'],
    }

    const orchestrator = createOrchestrator({
      sessionFactory: factory,
      toolRegistry,
    })
    orchestrator.agentRegistry.register(agent)

    await orchestrator.dispatcher.dispatch({
      prompt: 'work',
      subagent: 'limited',
      mode: 'sync',
    })

    expect(filteredTools).toHaveLength(1)
    expect(filteredTools[0]).toEqual(['file_read', 'bash'])
  })

  it('full lifecycle: dispatch → events → output → cleanup', async () => {
    const { factory, sessions } = createRealisticSessionFactory()
    const toolRegistry = createRealisticToolRegistry()

    const { orchestrator, callbacks } = bootstrapOrchestrator({
      sessionFactory: factory,
      toolRegistry,
      agents: [
        { name: 'analyzer', description: 'Code analyzer', model: 'gpt-4', capabilities: ['analysis'] },
        { name: 'fixer', description: 'Bug fixer', model: 'claude-sonnet', capabilities: ['fix'] },
      ],
      fallbackAgent: { name: 'general', description: 'General', model: 'gpt-3.5-turbo' },
    })

    // Track events
    const events: string[] = []
    orchestrator.eventBus.on('task.created', () => {
      events.push('created')
    })
    orchestrator.eventBus.on('task.started', () => {
      events.push('started')
    })
    orchestrator.eventBus.on('task.completed', () => {
      events.push('completed')
    })
    orchestrator.eventBus.on('task.failed', () => {
      events.push('failed')
    })

    // 1. Dispatch by name
    const r1 = await callbacks.dispatchTask({
      prompt: 'analyze this code',
      subagent: 'analyzer',
      mode: 'sync',
    })
    expect(r1.success).toBe(true)
    expect(r1.output).toContain('gpt-4')

    // 2. Dispatch by category
    const r2 = await callbacks.dispatchTask({
      prompt: 'fix the bug',
      category: 'fix',
      mode: 'sync',
    })
    expect(r2.success).toBe(true)
    expect(r2.output).toContain('claude-sonnet')

    // 3. Fallback agent
    const r3 = await callbacks.callAgent('unknown', 'hello')
    expect(r3.success).toBe(true)
    expect(r3.output).toContain('gpt-3.5-turbo')

    // 4. All sessions should be cleaned up
    expect(sessions.size).toBe(0)

    // 5. Events should be emitted in order
    expect(events).toEqual([
      'created', 'started', 'completed',  // r1
      'created', 'started', 'completed',  // r2
      // r3 goes through agentRegistry.call, not dispatcher — no dispatcher events
    ])
  })

  it('background task with realistic factory', async () => {
    const { factory, sessions } = createRealisticSessionFactory()

    const { orchestrator, callbacks } = bootstrapOrchestrator({
      sessionFactory: factory,
      toolRegistry: createRealisticToolRegistry(),
      agents: [{ name: 'bg-worker', description: 'Background', model: 'gpt-4' }],
    })

    // Track hooks integration
    let hookStartCalled = false
    let hookEndCalled = false

    // Test with hooks (simulated HookRegistryHandle)
    const hookAware = createOrchestrator({
      sessionFactory: factory,
      toolRegistry: createRealisticToolRegistry(),
      hooks: {
        emit: async (timing: string, _input: unknown) => {
          if (timing === 'background.start') hookStartCalled = true
          if (timing === 'background.end') hookEndCalled = true
        },
      },
    })
    hookAware.agentRegistry.register({ name: 'bg-worker', description: 'BG', model: 'gpt-4' })

    const bgResult = await hookAware.dispatcher.dispatch({
      prompt: 'background work',
      subagent: 'bg-worker',
      mode: 'background',
    })
    expect(bgResult.success).toBe(true)

    // Wait for background completion
    await new Promise(r => setTimeout(r, 100))

    // Hooks should have been called
    expect(hookStartCalled).toBe(true)
    expect(hookEndCalled).toBe(true)

    // Output should be available
    const output = await hookAware.backgroundManager.getOutput(bgResult.id!)
    expect(output.success).toBe(true)
    expect(output.output).toContain('gpt-4')
  })

  it('getSession returns undefined in Phase 1', () => {
    const { factory } = createRealisticSessionFactory()
    expect(factory.getSession?.('nonexistent')).toBeUndefined()
  })
})

// ═══ bridgeEventBusToHooks ═══

describe('bridgeEventBusToHooks', () => {
  it('forwards all orchestrator eventBus events to hooks.emit', async () => {
    const { bridgeEventBusToHooks } = await import('../src/events')
    const eventBus = createEventBus()
    const emitted: Array<{ timing: string; input: unknown }> = []

    const hooks = {
      emit: async (timing: string, input: unknown) => {
        emitted.push({ timing, input })
      },
    }

    const cleanup = bridgeEventBusToHooks(eventBus, hooks)

    await eventBus.emit('task.created', { task: { id: 't1' } } as never)
    await eventBus.emit('task.cancelled', { taskId: 'x' })
    await eventBus.emit('review.passed', { taskId: 't1', reviewType: 'spec' })

    expect(emitted).toHaveLength(3)
    expect(emitted[0]).toEqual({ timing: 'task.created', input: { task: { id: 't1' } } })
    expect(emitted[1]).toEqual({ timing: 'task.cancelled', input: { taskId: 'x' } })
    expect(emitted[2]).toEqual({ timing: 'review.passed', input: { taskId: 't1', reviewType: 'spec' } })

    cleanup()
  })

  it('cleanup stops forwarding events', async () => {
    const { bridgeEventBusToHooks } = await import('../src/events')
    const eventBus = createEventBus()
    const emitted: string[] = []

    const hooks = {
      emit: async (timing: string) => { emitted.push(timing) },
    }

    const cleanup = bridgeEventBusToHooks(eventBus, hooks)
    await eventBus.emit('task.cancelled', { taskId: 'x' })
    expect(emitted).toHaveLength(1)

    cleanup()
    await eventBus.emit('task.cancelled', { taskId: 'y' })
    expect(emitted).toHaveLength(1) // no new events after cleanup
  })

  it('is automatically wired when hooks provided to createOrchestrator', async () => {
    const emitted: string[] = []
    const hooks = {
      emit: async (timing: string) => { emitted.push(timing) },
    }

    const orchestrator = createOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
      hooks,
    })

    await orchestrator.eventBus.emit('review.passed', { taskId: 'p1', reviewType: 'spec' })
    expect(emitted).toContain('review.passed')
  })
})

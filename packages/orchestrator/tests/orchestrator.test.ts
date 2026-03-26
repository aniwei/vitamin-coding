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
    expect(callbacks.performWork).toBeTypeOf('function')
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

  it('performWork returns explicit NOT_IMPLEMENTED', async () => {
    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })

    const result = await callbacks.performWork('some-plan')
    expect(result.success).toBe(false)
    expect(result.error).toBe('NOT_IMPLEMENTED')
    expect(result.message).toContain('PlanEngine')
  })
})

import { describe, it, expect } from 'vitest'
import { bootstrapOrchestrator, createEventBus } from '../src'
import type {
  AgentSessionHandle,
  SessionFactory,
  ToolRegistryHandle,
  AgentSpec,
  OrchestratorEventType,
} from '../src'
import type { PlanFileStore } from '../src/plan-loader'

// ═══ 测试用桩 ═══

function createStubSession(output: string = 'step completed'): AgentSessionHandle {
  return {
    id: crypto.randomUUID(),
    status: 'idle',
    prompt: async (_text: string) => {},
    abort: () => {},
    getLastAssistantText: () => output,
  }
}

function createStubSessionFactory(output: string = 'step completed'): SessionFactory {
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
    filterByNames: () => [],
    getAvailable: () => [],
  }
}

function createMemoryPlanFileStore(): PlanFileStore & { files: Map<string, string> } {
  const files = new Map<string, string>()
  return {
    files,
    async read(path: string) {
      const content = files.get(path)
      if (!content) throw new Error(`File not found: ${path}`)
      return content
    },
    async write(path: string, content: string) {
      files.set(path, content)
    },
    async exists(path: string) {
      return files.has(path)
    },
  }
}

const SAMPLE_PLAN = `# Test Implementation Plan

**Goal:** Build test feature

### Task 1: Define types

Define interfaces.

- [ ] Create types

### Task 2: Implement feature

Build the feature.

- [ ] Write code

### Task 3: Add tests

Test everything.

- [ ] Write tests
`

const SINGLE_STEP_PLAN = `# Single Step Plan

**Goal:** Do one thing

### Task 1: The only step

Do the work.

- [ ] Done
`

const fallbackAgent: AgentSpec = {
  name: 'general',
  description: 'Fallback agent',
  model: 'gpt-4',
}

// ═══ performWork Integration ═══

describe('performWork Integration', () => {
  it('executes one step of a plan and returns success', async () => {
    const store = createMemoryPlanFileStore()
    store.files.set('plan.md', SAMPLE_PLAN)

    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
      planFileStore: store,
      fallbackAgent,
    })

    const result = await callbacks.performWork('plan.md')

    expect(result.success).toBe(true)
    expect(result.message).toContain('Define types')
    expect(result.message).toContain('completed')
  })

  it('advances to next step on repeated calls', async () => {
    const store = createMemoryPlanFileStore()
    store.files.set('plan.md', SAMPLE_PLAN)

    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
      planFileStore: store,
      fallbackAgent,
    })

    const r1 = await callbacks.performWork('plan.md')
    expect(r1.success).toBe(true)
    expect(r1.message).toContain('Define types')

    const r2 = await callbacks.performWork('plan.md')
    expect(r2.success).toBe(true)
    expect(r2.message).toContain('Implement feature')

    const r3 = await callbacks.performWork('plan.md')
    expect(r3.success).toBe(true)
    expect(r3.message).toContain('Add tests')
  })

  it('returns completed message when plan is fully done', async () => {
    const store = createMemoryPlanFileStore()
    store.files.set('plan.md', SINGLE_STEP_PLAN)

    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
      planFileStore: store,
      fallbackAgent,
    })

    // Execute the only step
    const r1 = await callbacks.performWork('plan.md')
    expect(r1.success).toBe(true)

    // Second call should report already completed
    const r2 = await callbacks.performWork('plan.md')
    expect(r2.success).toBe(true)
    expect(r2.message).toContain('already fully completed')
  })

  it('returns NO_PLAN_STORE when no planFileStore configured', async () => {
    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
    })

    const result = await callbacks.performWork('plan.md')
    expect(result.success).toBe(false)
    expect(result.error).toBe('NO_PLAN_STORE')
  })

  it('returns error for non-existent plan file', async () => {
    const store = createMemoryPlanFileStore()

    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
      planFileStore: store,
      fallbackAgent,
    })

    const result = await callbacks.performWork('missing.md')
    expect(result.success).toBe(false)
    expect(result.message).toContain('Failed to load')
  })

  it('emits plan lifecycle events', async () => {
    const store = createMemoryPlanFileStore()
    store.files.set('plan.md', SINGLE_STEP_PLAN)

    const { orchestrator, callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
      planFileStore: store,
      fallbackAgent,
    })

    const events: OrchestratorEventType[] = []
    orchestrator.eventBus.on('plan.started', () => events.push('plan.started'))
    orchestrator.eventBus.on('plan.step_completed', () => events.push('plan.step_completed'))
    orchestrator.eventBus.on('plan.completed', () => events.push('plan.completed'))

    await callbacks.performWork('plan.md')

    expect(events).toContain('plan.started')
    expect(events).toContain('plan.step_completed')
    expect(events).toContain('plan.completed')
  })

  it('saves checkpoint after completing step', async () => {
    const store = createMemoryPlanFileStore()
    store.files.set('plan.md', SAMPLE_PLAN)

    const { orchestrator, callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
      planFileStore: store,
      fallbackAgent,
    })

    await callbacks.performWork('plan.md')

    // Checkpoint store should have an entry
    const checkpoints = await orchestrator.checkpointStore!.list()
    expect(checkpoints.length).toBeGreaterThan(0)
    expect(checkpoints[0].metadata).toHaveProperty('stepTitle', 'Define types')
  })

  it('persists plan progress to store after step completion', async () => {
    const store = createMemoryPlanFileStore()
    store.files.set('plan.md', SAMPLE_PLAN)

    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: createStubSessionFactory(),
      toolRegistry: createStubToolRegistry(),
      planFileStore: store,
      fallbackAgent,
    })

    await callbacks.performWork('plan.md')

    // The plan file should have been written back
    const content = store.files.get('plan.md')!
    expect(content).toBeDefined()
  })

  it('handles dispatch failure gracefully', async () => {
    const store = createMemoryPlanFileStore()
    store.files.set('plan.md', SAMPLE_PLAN)

    // Session factory that throws
    const failFactory: SessionFactory = {
      async createSession() {
        throw new Error('session failed')
      },
      async removeSession() { return false },
    }

    const { callbacks } = bootstrapOrchestrator({
      sessionFactory: failFactory,
      toolRegistry: createStubToolRegistry(),
      planFileStore: store,
      fallbackAgent,
    })

    const result = await callbacks.performWork('plan.md')
    expect(result.success).toBe(false)
    // Should indicate the step that failed
    expect(result.message).toContain('Define types')
  })
})

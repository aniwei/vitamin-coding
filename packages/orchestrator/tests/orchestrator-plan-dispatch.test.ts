import { describe, expect, it } from 'vitest'

import { createAgentProfileRegistry, createOrchestrator } from '../src'
import type {
  AgentSessionHandle,
  Plan,
  PlanStore,
  RegisteredAgentProfile,
  SessionFactory,
  ToolRegistryHandle,
} from '../src'

function createStubToolRegistry(): ToolRegistryHandle {
  return {
    filterByNames: () => [],
    getAvailable: () => [],
  }
}

function createRecordingSessionFactory(output: string) {
  const prompts: string[] = []

  const factory: SessionFactory = {
    async createSession() {
      const session: AgentSessionHandle = {
        id: crypto.randomUUID(),
        status: 'idle',
        prompt: async (text: string) => {
          prompts.push(text)
        },
        abort: () => {},
        getLastAssistantText: () => output,
      }
      return session
    },
    async removeSession() {
      return true
    },
  }

  return { factory, prompts }
}

function createInMemoryPlanStore(plans: Plan[]) {
  const map = new Map(plans.map((p) => [p.id, p]))
  let updateTaskCalls = 0

  const store: PlanStore = {
    create: async (plan) => {
      map.set(plan.id, plan)
      return plan
    },
    get: async (planId) => map.get(planId),
    update: async (planId, patch) => {
      const existing = map.get(planId)
      if (!existing) {
        throw new Error(`Plan ${planId} not found`)
      }
      const updated = { ...existing, ...patch }
      map.set(planId, updated)
      return updated
    },
    delete: async (planId) => map.delete(planId),
    listBySession: async (sessionId) =>
      Array.from(map.values())
        .filter((p) => p.sessionId === sessionId)
        .map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          taskCount: p.tasks.length,
          completedCount: p.tasks.filter((t) => t.status === 'completed' || t.status === 'skipped').length,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
    listByStatus: async (status) =>
      Array.from(map.values())
        .filter((p) => p.status === status)
        .map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          taskCount: p.tasks.length,
          completedCount: p.tasks.filter((t) => t.status === 'completed' || t.status === 'skipped').length,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
    getActive: async (sessionId) =>
      Array.from(map.values()).find((p) => p.sessionId === sessionId && p.status === 'active'),
    updateTask: async () => {
      updateTaskCalls += 1
      throw new Error('updateTask should not be called by plan-based dispatch')
    },
    getReadyTasks: async () => [],
    getVersion: async (planId) => map.get(planId)?.version ?? 0,
    getMarkdown: async (planId) => {
      const plan = map.get(planId)
      if (!plan) return undefined
      return `# ${plan.name}`
    },
  }

  return { store, getUpdateTaskCalls: () => updateTaskCalls }
}

function createPlan(): Plan {
  const now = Date.now()
  return {
    id: 'plan-1',
    version: 1,
    name: 'Auth Refactor Plan',
    goal: 'Refactor auth with tests',
    architecture: 'Layered auth service and adapters',
    constraints: ['Keep API stable'],
    tasks: [
      {
        id: 'task-1',
        title: 'Implement auth service',
        description: 'Create service methods and integrate adapter.',
        type: 'code_generation',
        status: 'pending',
        attempts: 0,
      },
    ],
    status: 'active',
    sessionId: 'sess-1',
    createdAt: now,
    updatedAt: now,
  }
}

function registerCoderProfile() {
  const registry = createAgentProfileRegistry()
  const profile: RegisteredAgentProfile = {
    name: 'coder',
    taskTypes: ['code_generation'],
    capabilities: ['code_generation'],
    systemPromptTemplate: [
      'Plan goal: {plan_goal}',
      'Architecture: {plan_architecture}',
      'Task: {task_title}',
      'Description: {task_description}',
    ].join('\n'),
    preferredModelTier: 'standard',
    defaultMaxToolTurns: 8,
  }
  registry.register(profile)
  return registry
}

describe('orchestrator plan dispatch (document-first)', () => {
  it('requires explicit taskId for plan-based dispatch', async () => {
    const { factory } = createRecordingSessionFactory('ok')
    const { store } = createInMemoryPlanStore([createPlan()])

    const orchestrator = createOrchestrator({
      sessionFactory: factory,
      toolRegistry: createStubToolRegistry(),
      planStore: store,
      agentProfileRegistry: registerCoderProfile(),
    })

    const callbacks = orchestrator.toToolCallbacks()
    const result = await callbacks.dispatchTask({
      planId: 'plan-1',
      mode: 'sync',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('taskId is required')
  })

  it('dispatches selected task and does not auto-update plan task state', async () => {
    const { factory, prompts } = createRecordingSessionFactory('implemented')
    const { store, getUpdateTaskCalls } = createInMemoryPlanStore([createPlan()])

    const orchestrator = createOrchestrator({
      sessionFactory: factory,
      toolRegistry: createStubToolRegistry(),
      planStore: store,
      agentProfileRegistry: registerCoderProfile(),
    })

    const callbacks = orchestrator.toToolCallbacks()
    const result = await callbacks.dispatchTask({
      planId: 'plan-1',
      taskId: 'task-1',
      mode: 'sync',
    })

    expect(result.success).toBe(true)
    expect(result.output).toBe('implemented')
    expect(getUpdateTaskCalls()).toBe(0)

    const promptText = prompts.join('\n')
    expect(promptText).toContain('### Plan Context')
    expect(promptText).toContain('Refactor auth with tests')
    expect(promptText).toContain('Implement auth service')
  })
})

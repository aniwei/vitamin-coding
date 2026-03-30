import { describe, it, expect, beforeEach } from 'vitest'
import { resolveAgentProfileForTask, TASK_TYPE_PROFILE_MAP } from '../src/task-type-router'
import { createAgentProfileRegistry } from '../src/agent-profile-registry'
import type { AgentProfileRegistry, PlanTask, RegisteredAgentProfile, TaskType } from '../src/types'

function makeProfile(overrides: Partial<RegisteredAgentProfile> = {}): RegisteredAgentProfile {
  return {
    name: 'default',
    taskTypes: ['custom'] as TaskType[],
    capabilities: [],
    systemPromptTemplate: 'Prompt for {task_title}',
    preferredModelTier: 'standard',
    defaultMaxToolTurns: 25,
    ...overrides,
  }
}

function makeTask(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: 't-1',
    title: 'Test task',
    description: 'A task',
    type: 'code_generation',
    status: 'ready',
    attempts: 0,
    ...overrides,
  }
}

describe('TASK_TYPE_PROFILE_MAP', () => {
  it('maps all TaskType values', () => {
    const types: TaskType[] = [
      'code_generation', 'code_modification', 'refactoring', 'testing',
      'debugging', 'research', 'documentation', 'review', 'infrastructure', 'custom',
    ]
    for (const t of types) {
      expect(TASK_TYPE_PROFILE_MAP[t]).toBeTruthy()
    }
  })

  it('maps code_generation to coder', () => {
    expect(TASK_TYPE_PROFILE_MAP.code_generation).toBe('coder')
  })

  it('maps testing to tester', () => {
    expect(TASK_TYPE_PROFILE_MAP.testing).toBe('tester')
  })

  it('maps custom to __fallback__', () => {
    expect(TASK_TYPE_PROFILE_MAP.custom).toBe('__fallback__')
  })
})

describe('resolveAgentProfileForTask', () => {
  let registry: AgentProfileRegistry

  beforeEach(() => {
    registry = createAgentProfileRegistry()
    // Register profiles matching the TASK_TYPE_PROFILE_MAP
    registry.register(makeProfile({ name: 'coder', taskTypes: ['code_generation', 'code_modification'] }))
    registry.register(makeProfile({ name: 'tester', taskTypes: ['testing'] }))
    registry.register(makeProfile({ name: 'debugger', taskTypes: ['debugging'] }))
    registry.register(makeProfile({ name: '__fallback__', taskTypes: ['custom'] }))
  })

  it('resolves by task.execution.agentProfile first', () => {
    const task = makeTask({
      type: 'testing',
      execution: {
        agentProfile: 'coder',
        workflowSlot: 'execution',
      },
    })
    const result = resolveAgentProfileForTask(task, registry)
    expect(result!.name).toBe('coder')
  })

  it('falls through to type map when execution.agentProfile not found', () => {
    const task = makeTask({
      type: 'testing',
      execution: {
        agentProfile: 'nonexistent',
        workflowSlot: 'execution',
      },
    })
    const result = resolveAgentProfileForTask(task, registry)
    expect(result!.name).toBe('tester')
  })

  it('resolves by TaskType map', () => {
    const task = makeTask({ type: 'code_generation' })
    const result = resolveAgentProfileForTask(task, registry)
    expect(result!.name).toBe('coder')
  })

  it('resolves debugging type to debugger', () => {
    const task = makeTask({ type: 'debugging' })
    const result = resolveAgentProfileForTask(task, registry)
    expect(result!.name).toBe('debugger')
  })

  it('falls back to __fallback__ for custom type', () => {
    const task = makeTask({ type: 'custom' })
    const result = resolveAgentProfileForTask(task, registry)
    expect(result!.name).toBe('__fallback__')
  })

  it('returns undefined when profile not registered', () => {
    const emptyRegistry = createAgentProfileRegistry()
    const task = makeTask({ type: 'code_generation' })
    const result = resolveAgentProfileForTask(task, emptyRegistry)
    expect(result).toBeUndefined()
  })
})

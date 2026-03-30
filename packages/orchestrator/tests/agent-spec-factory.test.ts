import { describe, it, expect } from 'vitest'
import { ensureTaskExecutionSpec, buildAgentSpec, prepareAgentSpec } from '../src/agent-spec-factory'
import type { Plan, PlanTask, RegisteredAgentProfile, SkillAdapter, TaskType } from '../src/types'

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    version: 1,
    name: 'Test Plan',
    goal: 'Build a widget',
    architecture: 'Monorepo with packages',
    constraints: ['Use TypeScript', 'No external deps'],
    tasks: [],
    status: 'active',
    sessionId: 'sess-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function makeTask(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: 't-1',
    title: 'Implement feature X',
    description: 'Create the feature X module',
    type: 'code_generation',
    status: 'ready',
    attempts: 0,
    files: ['src/feature-x.ts'],
    ...overrides,
  }
}

function makeProfile(overrides: Partial<RegisteredAgentProfile> = {}): RegisteredAgentProfile {
  return {
    name: 'coder',
    taskTypes: ['code_generation', 'code_modification'] as TaskType[],
    capabilities: ['coding'],
    systemPromptTemplate: `You are a coder.
Plan goal: {plan_goal}
Architecture: {plan_architecture}
Constraints: {plan_constraints}
Task: {task_title}
Description: {task_description}
Files: {task_files}`,
    defaultTools: ['read_file', 'write_file'],
    preferredModelTier: 'standard',
    defaultMaxToolTurns: 25,
    ...overrides,
  }
}

describe('ensureTaskExecutionSpec', () => {
  it('returns existing execution spec when present', () => {
    const task = makeTask({
      execution: {
        agentProfile: 'custom-coder',
        workflowSlot: 'planning',
        maxToolTurns: 10,
      },
    })
    const result = ensureTaskExecutionSpec(makePlan(), task)
    expect(result.agentProfile).toBe('custom-coder')
    expect(result.workflowSlot).toBe('planning')
    expect(result.maxToolTurns).toBe(10)
  })

  it('generates default spec from task type when missing', () => {
    const task = makeTask({ type: 'testing', execution: undefined })
    const result = ensureTaskExecutionSpec(makePlan(), task)

    expect(result.agentProfile).toBe('tester')
    expect(result.workflowSlot).toBe('execution')
    expect(result.generatedAt).toBeGreaterThan(0)
  })

  it('maps code_generation to coder profile', () => {
    const task = makeTask({ type: 'code_generation', execution: undefined })
    const result = ensureTaskExecutionSpec(makePlan(), task)
    expect(result.agentProfile).toBe('coder')
  })
})

describe('buildAgentSpec', () => {
  it('substitutes all template variables', () => {
    const profile = makeProfile()
    const plan = makePlan()
    const task = makeTask()
    const execution = { agentProfile: 'coder', workflowSlot: 'execution' }

    const spec = buildAgentSpec(profile, plan, task, execution)

    expect(spec.systemPrompt).toContain('Build a widget')
    expect(spec.systemPrompt).toContain('Monorepo with packages')
    expect(spec.systemPrompt).toContain('Use TypeScript')
    expect(spec.systemPrompt).toContain('Implement feature X')
    expect(spec.systemPrompt).toContain('Create the feature X module')
    expect(spec.systemPrompt).toContain('src/feature-x.ts')
  })

  it('uses N/A for missing architecture', () => {
    const plan = makePlan({ architecture: undefined })
    const spec = buildAgentSpec(makeProfile(), plan, makeTask(), { workflowSlot: 'execution' })

    expect(spec.systemPrompt).toContain('N/A')
  })

  it('uses None for empty constraints', () => {
    const plan = makePlan({ constraints: [] })
    const spec = buildAgentSpec(makeProfile(), plan, makeTask(), { workflowSlot: 'execution' })

    expect(spec.systemPrompt).toContain('None')
  })

  it('uses N/A for missing task files', () => {
    const task = makeTask({ files: undefined })
    const spec = buildAgentSpec(makeProfile(), makePlan(), task, { workflowSlot: 'execution' })

    expect(spec.systemPrompt).toContain('Files: N/A')
  })

  it('appends execution systemPromptAddendum', () => {
    const execution = {
      workflowSlot: 'execution',
      systemPromptAddendum: 'Extra instructions here',
    }
    const spec = buildAgentSpec(makeProfile(), makePlan(), makeTask(), execution)

    expect(spec.systemPrompt).toContain('## Execution Notes')
    expect(spec.systemPrompt).toContain('Extra instructions here')
  })

  it('appends skill context', () => {
    const spec = buildAgentSpec(
      makeProfile(), makePlan(), makeTask(),
      { workflowSlot: 'execution' },
      'Skill context from testing',
    )

    expect(spec.systemPrompt).toContain('## Skill Reference')
    expect(spec.systemPrompt).toContain('Skill context from testing')
  })

  it('sets name as profile:taskId', () => {
    const spec = buildAgentSpec(makeProfile({ name: 'coder' }), makePlan(), makeTask({ id: 'task-42' }), { workflowSlot: 'execution' })
    expect(spec.name).toBe('coder:task-42')
  })

  it('uses execution tools over profile defaults', () => {
    const execution = { workflowSlot: 'execution', tools: ['custom_tool'] }
    const spec = buildAgentSpec(makeProfile({ defaultTools: ['read_file'] }), makePlan(), makeTask(), execution)
    expect(spec.tools).toEqual(['custom_tool'])
  })

  it('falls back to profile default tools', () => {
    const execution = { workflowSlot: 'execution' }
    const spec = buildAgentSpec(makeProfile({ defaultTools: ['read_file', 'write_file'] }), makePlan(), makeTask(), execution)
    expect(spec.tools).toEqual(['read_file', 'write_file'])
  })

  it('uses execution maxToolTurns when specified', () => {
    const execution = { workflowSlot: 'execution', maxToolTurns: 5 }
    const spec = buildAgentSpec(makeProfile({ defaultMaxToolTurns: 25 }), makePlan(), makeTask(), execution)
    expect(spec.maxToolTurns).toBe(5)
  })

  it('sets modelSlots from execution workflowSlot', () => {
    const execution = { workflowSlot: 'planning' }
    const spec = buildAgentSpec(makeProfile(), makePlan(), makeTask(), execution)
    expect(spec.modelSlots).toEqual({ planning: '' })
  })
})

describe('prepareAgentSpec', () => {
  it('works without skillAdapter', async () => {
    const spec = await prepareAgentSpec(makeProfile(), makePlan(), makeTask())

    expect(spec.name).toBe('coder:t-1')
    expect(spec.systemPrompt).toContain('Build a widget')
  })

  it('loads skill context when adapter and requiredSkills provided', async () => {
    const task = makeTask({
      execution: {
        agentProfile: 'coder',
        workflowSlot: 'execution',
        requiredSkills: ['testing-skill'],
      },
    })

    const skillAdapter: SkillAdapter = {
      async load(path: string) {
        return { success: true, name: path }
      },
      async execute() {
        return { success: true, output: 'done' }
      },
      async getContext(name: string) {
        return `Context for ${name}`
      },
    }

    const spec = await prepareAgentSpec(makeProfile(), makePlan(), task, skillAdapter)
    expect(spec.systemPrompt).toContain('Context for testing-skill')
    expect(spec.systemPrompt).toContain('## Skill Reference')
  })

  it('skips skill context when load fails', async () => {
    const task = makeTask({
      execution: {
        agentProfile: 'coder',
        workflowSlot: 'execution',
        requiredSkills: ['bad-skill'],
      },
    })

    const skillAdapter: SkillAdapter = {
      async load() {
        return { success: false, error: 'not found' }
      },
      async execute() {
        return { success: true }
      },
      async getContext() {
        return 'Should not appear'
      },
    }

    const spec = await prepareAgentSpec(makeProfile(), makePlan(), task, skillAdapter)
    expect(spec.systemPrompt).not.toContain('## Skill Reference')
  })
})

import { describe, it, expect } from 'vitest'
import { planToMarkdown, markdownToPlan } from '../src/plan-markdown'
import type { Plan, PlanTask } from '../src/types'

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    version: 2,
    name: 'Build Auth System',
    goal: 'Implement JWT-based authentication',
    architecture: 'Monorepo with packages/auth',
    constraints: ['Use TypeScript', 'No external auth providers'],
    tasks: [],
    status: 'active',
    sessionId: 'sess-1',
    createdAt: 1711792800000,
    updatedAt: 1711792900000,
    ...overrides,
  }
}

function makeTask(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: 'task-1',
    title: 'Create types',
    description: 'Define AuthUser and AuthToken interfaces',
    type: 'code_generation',
    status: 'pending',
    attempts: 0,
    ...overrides,
  }
}

describe('planToMarkdown', () => {
  it('generates valid Markdown with YAML frontmatter', () => {
    const plan = makePlan()
    const md = planToMarkdown(plan)

    expect(md).toContain('---')
    expect(md).toContain('id: plan-1')
    expect(md).toContain('version: 2')
    expect(md).toContain('status: active')
    expect(md).toContain('sessionId: sess-1')
  })

  it('includes plan title as h1', () => {
    const md = planToMarkdown(makePlan({ name: 'My Plan' }))
    expect(md).toContain('# My Plan')
  })

  it('includes goal section', () => {
    const md = planToMarkdown(makePlan({ goal: 'Build the thing' }))
    expect(md).toContain('## Goal')
    expect(md).toContain('Build the thing')
  })

  it('includes architecture when present', () => {
    const md = planToMarkdown(makePlan({ architecture: 'Microservices' }))
    expect(md).toContain('## Architecture')
    expect(md).toContain('Microservices')
  })

  it('omits architecture when absent', () => {
    const md = planToMarkdown(makePlan({ architecture: undefined }))
    expect(md).not.toContain('## Architecture')
  })

  it('includes constraints as list', () => {
    const md = planToMarkdown(makePlan({ constraints: ['A', 'B'] }))
    expect(md).toContain('## Constraints')
    expect(md).toContain('- A')
    expect(md).toContain('- B')
  })

  it('serializes tasks with status markers', () => {
    const plan = makePlan({
      tasks: [
        makeTask({ id: 't-1', title: 'First', status: 'completed' }),
        makeTask({ id: 't-2', title: 'Second', status: 'running' }),
        makeTask({ id: 't-3', title: 'Third', status: 'pending' }),
      ],
    })
    const md = planToMarkdown(plan)

    expect(md).toContain('### t-1: First [completed]')
    expect(md).toContain('### t-2: Second [running]')
    expect(md).toContain('### t-3: Third [pending]')
  })

  it('includes task metadata', () => {
    const plan = makePlan({
      tasks: [makeTask({
        type: 'testing',
        estimatedComplexity: 'medium',
        files: ['src/a.ts', 'src/b.ts'],
        dependencies: ['t-0'],
        attempts: 2,
      })],
    })
    const md = planToMarkdown(plan)

    expect(md).toContain('- Type: testing')
    expect(md).toContain('- Complexity: medium')
    expect(md).toContain('- Files: src/a.ts, src/b.ts')
    expect(md).toContain('- Dependencies: t-0')
    expect(md).toContain('- Attempts: 2')
  })

  it('includes task output', () => {
    const plan = makePlan({
      tasks: [makeTask({
        output: { summary: 'Tests passed', text: 'All 10 assertions green' },
      })],
    })
    const md = planToMarkdown(plan)

    expect(md).toContain('> **Output:** Tests passed')
    expect(md).toContain('> All 10 assertions green')
  })

  it('includes task error', () => {
    const plan = makePlan({
      tasks: [makeTask({
        error: { code: 'COMPILE_ERROR', message: 'Missing import' },
      })],
    })
    const md = planToMarkdown(plan)

    expect(md).toContain('> **Error** [COMPILE_ERROR]: Missing import')
  })

  it('includes completedAt in frontmatter when present', () => {
    const md = planToMarkdown(makePlan({ completedAt: 1711793000000 }))
    expect(md).toContain('completedAt: 1711793000000')
  })

  it('omits completedAt when absent', () => {
    const md = planToMarkdown(makePlan({ completedAt: undefined }))
    expect(md).not.toContain('completedAt')
  })
})

describe('markdownToPlan', () => {
  it('roundtrips a complete plan', () => {
    const original = makePlan({
      tasks: [
        makeTask({ id: 't-1', title: 'Create types', status: 'completed', type: 'code_generation', attempts: 1 }),
        makeTask({ id: 't-2', title: 'Implement JWT', status: 'running', type: 'code_modification', dependencies: ['t-1'], files: ['src/jwt.ts'], attempts: 1 }),
        makeTask({ id: 't-3', title: 'Add tests', status: 'pending', type: 'testing', dependencies: ['t-2'], estimatedComplexity: 'high', attempts: 0 }),
      ],
    })

    const md = planToMarkdown(original)
    const parsed = markdownToPlan(md)

    expect(parsed.id).toBe(original.id)
    expect(parsed.version).toBe(original.version)
    expect(parsed.name).toBe(original.name)
    expect(parsed.goal).toBe(original.goal)
    expect(parsed.architecture).toBe(original.architecture)
    expect(parsed.constraints).toEqual(original.constraints)
    expect(parsed.status).toBe(original.status)
    expect(parsed.sessionId).toBe(original.sessionId)
    expect(parsed.createdAt).toBe(original.createdAt)
    expect(parsed.updatedAt).toBe(original.updatedAt)
    expect(parsed.tasks).toHaveLength(3)
  })

  it('roundtrips task details', () => {
    const task = makeTask({
      id: 't-1',
      title: 'Do something',
      description: 'A detailed description\nof the task',
      type: 'refactoring',
      status: 'ready',
      dependencies: ['t-0'],
      files: ['src/a.ts'],
      estimatedComplexity: 'low',
      attempts: 3,
    })

    const md = planToMarkdown(makePlan({ tasks: [task] }))
    const parsed = markdownToPlan(md)
    const rt = parsed.tasks[0]!

    expect(rt.id).toBe('t-1')
    expect(rt.title).toBe('Do something')
    expect(rt.description).toContain('A detailed description')
    expect(rt.type).toBe('refactoring')
    expect(rt.status).toBe('ready')
    expect(rt.dependencies).toEqual(['t-0'])
    expect(rt.files).toEqual(['src/a.ts'])
    expect(rt.estimatedComplexity).toBe('low')
    expect(rt.attempts).toBe(3)
  })

  it('roundtrips task output', () => {
    const task = makeTask({
      output: { summary: 'Done successfully', text: 'Created 3 files' },
    })

    const md = planToMarkdown(makePlan({ tasks: [task] }))
    const parsed = markdownToPlan(md)
    const rt = parsed.tasks[0]!

    expect(rt.output).toBeDefined()
    expect(rt.output!.summary).toBe('Done successfully')
    expect(rt.output!.text).toBe('Created 3 files')
  })

  it('roundtrips task error', () => {
    const task = makeTask({
      error: { code: 'TIMEOUT', message: 'Task exceeded time limit' },
    })

    const md = planToMarkdown(makePlan({ tasks: [task] }))
    const parsed = markdownToPlan(md)
    const rt = parsed.tasks[0]!

    expect(rt.error).toBeDefined()
    expect(rt.error!.code).toBe('TIMEOUT')
    expect(rt.error!.message).toBe('Task exceeded time limit')
  })

  it('handles plan without architecture or constraints', () => {
    const plan = makePlan({ architecture: undefined, constraints: undefined })
    const md = planToMarkdown(plan)
    const parsed = markdownToPlan(md)

    expect(parsed.architecture).toBeUndefined()
    expect(parsed.constraints).toBeUndefined()
  })

  it('handles tasks with no dependencies', () => {
    const task = makeTask({ dependencies: undefined })
    const md = planToMarkdown(makePlan({ tasks: [task] }))
    const parsed = markdownToPlan(md)

    expect(parsed.tasks[0]!.dependencies).toBeUndefined()
  })

  it('handles plan with completedAt', () => {
    const plan = makePlan({ completedAt: 1711793000000 })
    const md = planToMarkdown(plan)
    const parsed = markdownToPlan(md)

    expect(parsed.completedAt).toBe(1711793000000)
  })

  it('handles empty tasks list', () => {
    const plan = makePlan({ tasks: [] })
    const md = planToMarkdown(plan)
    const parsed = markdownToPlan(md)

    expect(parsed.tasks).toEqual([])
  })

  it('parses raw Markdown without frontmatter gracefully', () => {
    const md = '# Some Plan\n\n## Goal\n\nDo things'
    const parsed = markdownToPlan(md)

    expect(parsed.id).toBe('')
    expect(parsed.goal).toBe('Do things')
  })
})

describe('Markdown format', () => {
  it('produces human-readable output', () => {
    const plan = makePlan({
      tasks: [
        makeTask({ id: 't-1', status: 'completed', output: { summary: 'Created interfaces' } }),
        makeTask({ id: 't-2', title: 'Implement service', status: 'running', dependencies: ['t-1'] }),
      ],
    })
    const md = planToMarkdown(plan)

    // The Markdown should be readable as-is
    expect(md).toContain('# Build Auth System')
    expect(md).toContain('## Goal')
    expect(md).toContain('## Tasks')
    expect(md).toContain('[completed]')
    expect(md).toContain('[running]')
    expect(md).toContain('> **Output:** Created interfaces')
  })
})

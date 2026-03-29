import { describe, it, expect } from 'vitest'
import {
  parsePlanFile,
  updateStepStatus,
  getNextPendingStep,
  isPlanCompleted,
  buildStepPrompt,
  createPlanLoader,
} from '../src/plan-loader'
import type { PlanFileStore, PlanFile, PlanStep } from '../src/plan-loader'

// ═══ 测试用计划文件内容 ═══

const SAMPLE_PLAN = `# MyProject Implementation Plan

**Goal:** Build a task scheduler with retry support
**Architecture:** Event-driven with plugin checkers

### Task 1: Define core types

Define the main interfaces and types for the scheduler.

**Files:**
- Create: \`src/types.ts\`
- Create: \`src/index.ts\`

- [ ] Define TaskConfig interface
- [ ] Define SchedulerOptions interface

### Task 2: Implement scheduler

Build the core scheduling logic.

**Files:**
- Create: \`src/scheduler.ts\`
- Modify: \`src/index.ts\`

- [ ] Implement createScheduler function
- [ ] Add task queue management

### Task 3: Add retry support

Implement retry logic with exponential backoff.

**Files:**
- Create: \`src/retry.ts\`
- Test: \`tests/retry.test.ts\`

- [ ] Implement retry strategy
- [ ] Add circuit breaker
`

const PARTIAL_PLAN = `# Partial Plan

**Goal:** Partly done

### Task 1: Already done

- [x] Step A
- [x] Step B

### Task 2: In progress

- [x] Step C
- [ ] Step D

### Task 3: Not started

- [ ] Step E
`

// ═══ parsePlanFile ═══

describe('parsePlanFile', () => {
  it('extracts plan name from first heading', () => {
    const plan = parsePlanFile(SAMPLE_PLAN, 'my-plan.md')
    expect(plan.name).toBe('MyProject')
  })

  it('extracts goal and architecture', () => {
    const plan = parsePlanFile(SAMPLE_PLAN)
    expect(plan.goal).toBe('Build a task scheduler with retry support')
    expect(plan.architecture).toBe('Event-driven with plugin checkers')
  })

  it('parses all tasks as steps', () => {
    const plan = parsePlanFile(SAMPLE_PLAN)
    expect(plan.steps).toHaveLength(3)
    expect(plan.steps[0].id).toBe('step-1')
    expect(plan.steps[0].title).toBe('Define core types')
    expect(plan.steps[1].id).toBe('step-2')
    expect(plan.steps[1].title).toBe('Implement scheduler')
    expect(plan.steps[2].id).toBe('step-3')
    expect(plan.steps[2].title).toBe('Add retry support')
  })

  it('extracts files from **Files:** section', () => {
    const plan = parsePlanFile(SAMPLE_PLAN)
    expect(plan.steps[0].files).toEqual(['src/types.ts', 'src/index.ts'])
    expect(plan.steps[1].files).toEqual(['src/scheduler.ts', 'src/index.ts'])
    expect(plan.steps[2].files).toEqual(['src/retry.ts', 'tests/retry.test.ts'])
  })

  it('all steps default to pending when no checkboxes checked', () => {
    const plan = parsePlanFile(SAMPLE_PLAN)
    for (const step of plan.steps) {
      expect(step.status).toBe('pending')
    }
  })

  it('derives completed status from all-checked checkboxes', () => {
    const plan = parsePlanFile(PARTIAL_PLAN)
    expect(plan.steps[0].status).toBe('completed')
  })

  it('derives in_progress status from partially-checked checkboxes', () => {
    const plan = parsePlanFile(PARTIAL_PLAN)
    expect(plan.steps[1].status).toBe('in_progress')
  })

  it('derives pending status from unchecked checkboxes', () => {
    const plan = parsePlanFile(PARTIAL_PLAN)
    expect(plan.steps[2].status).toBe('pending')
  })

  it('preserves rawContent', () => {
    const plan = parsePlanFile(SAMPLE_PLAN)
    expect(plan.rawContent).toBe(SAMPLE_PLAN)
  })

  it('sets filePath when provided', () => {
    const plan = parsePlanFile(SAMPLE_PLAN, '/plans/my-plan.md')
    expect(plan.filePath).toBe('/plans/my-plan.md')
  })

  it('generates id from filePath basename', () => {
    const plan = parsePlanFile(SAMPLE_PLAN, '/plans/my-plan.md')
    expect(plan.id).toBe('my-plan')
  })

  it('handles empty content gracefully', () => {
    const plan = parsePlanFile('')
    expect(plan.steps).toHaveLength(0)
    expect(plan.goal).toBe('')
  })

  it('includes body text in step body', () => {
    const plan = parsePlanFile(SAMPLE_PLAN)
    expect(plan.steps[0].body).toContain('Define the main interfaces')
  })
})

// ═══ updateStepStatus ═══

describe('updateStepStatus', () => {
  it('updates specified step status immutably', () => {
    const plan = parsePlanFile(SAMPLE_PLAN)
    const updated = updateStepStatus(plan, 'step-1', 'completed')

    expect(updated.steps[0].status).toBe('completed')
    expect(updated.steps[1].status).toBe('pending')
    // Original unchanged
    expect(plan.steps[0].status).toBe('pending')
  })

  it('leaves other steps untouched', () => {
    const plan = parsePlanFile(SAMPLE_PLAN)
    const updated = updateStepStatus(plan, 'step-2', 'in_progress')

    expect(updated.steps[0].status).toBe('pending')
    expect(updated.steps[1].status).toBe('in_progress')
    expect(updated.steps[2].status).toBe('pending')
  })

  it('handles non-existent step id', () => {
    const plan = parsePlanFile(SAMPLE_PLAN)
    const updated = updateStepStatus(plan, 'nonexistent', 'completed')
    // All unchanged
    for (const step of updated.steps) {
      expect(step.status).toBe('pending')
    }
  })
})

// ═══ getNextPendingStep ═══

describe('getNextPendingStep', () => {
  it('returns first pending step', () => {
    const plan = parsePlanFile(SAMPLE_PLAN)
    const next = getNextPendingStep(plan)
    expect(next?.id).toBe('step-1')
  })

  it('skips completed steps', () => {
    let plan = parsePlanFile(SAMPLE_PLAN)
    plan = updateStepStatus(plan, 'step-1', 'completed')
    const next = getNextPendingStep(plan)
    expect(next?.id).toBe('step-2')
  })

  it('returns undefined when all completed', () => {
    let plan = parsePlanFile(SAMPLE_PLAN)
    plan = updateStepStatus(plan, 'step-1', 'completed')
    plan = updateStepStatus(plan, 'step-2', 'completed')
    plan = updateStepStatus(plan, 'step-3', 'completed')
    expect(getNextPendingStep(plan)).toBeUndefined()
  })

  it('returns undefined for empty plan', () => {
    const plan = parsePlanFile('')
    expect(getNextPendingStep(plan)).toBeUndefined()
  })
})

// ═══ isPlanCompleted ═══

describe('isPlanCompleted', () => {
  it('returns false when steps are pending', () => {
    const plan = parsePlanFile(SAMPLE_PLAN)
    expect(isPlanCompleted(plan)).toBe(false)
  })

  it('returns true when all steps completed', () => {
    let plan = parsePlanFile(SAMPLE_PLAN)
    plan = updateStepStatus(plan, 'step-1', 'completed')
    plan = updateStepStatus(plan, 'step-2', 'completed')
    plan = updateStepStatus(plan, 'step-3', 'completed')
    expect(isPlanCompleted(plan)).toBe(true)
  })

  it('returns false when some steps in_progress', () => {
    let plan = parsePlanFile(SAMPLE_PLAN)
    plan = updateStepStatus(plan, 'step-1', 'completed')
    plan = updateStepStatus(plan, 'step-2', 'in_progress')
    expect(isPlanCompleted(plan)).toBe(false)
  })

  it('returns false for empty plan', () => {
    const plan = parsePlanFile('')
    expect(isPlanCompleted(plan)).toBe(false)
  })
})

// ═══ buildStepPrompt ═══

describe('buildStepPrompt', () => {
  it('includes plan name, goal, progress, and step title', () => {
    const plan = parsePlanFile(SAMPLE_PLAN)
    const prompt = buildStepPrompt(plan, plan.steps[0])

    expect(prompt).toContain('Plan: MyProject')
    expect(prompt).toContain('Build a task scheduler with retry support')
    expect(prompt).toContain('0/3 steps completed')
    expect(prompt).toContain('Current Task: Define core types')
  })

  it('shows correct progress after completing steps', () => {
    let plan = parsePlanFile(SAMPLE_PLAN)
    plan = updateStepStatus(plan, 'step-1', 'completed')
    const prompt = buildStepPrompt(plan, plan.steps[1])

    expect(prompt).toContain('1/3 steps completed')
    expect(prompt).toContain('1 remaining')
  })

  it('includes files involved', () => {
    const plan = parsePlanFile(SAMPLE_PLAN)
    const prompt = buildStepPrompt(plan, plan.steps[0])

    expect(prompt).toContain('Files involved: src/types.ts, src/index.ts')
  })

  it('includes step body content', () => {
    const plan = parsePlanFile(SAMPLE_PLAN)
    const prompt = buildStepPrompt(plan, plan.steps[0])

    expect(prompt).toContain('Define the main interfaces')
  })
})

// ═══ createPlanLoader ═══

describe('createPlanLoader', () => {
  function createMemoryStore(): PlanFileStore & { files: Map<string, string> } {
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

  it('load() parses and caches plan file', async () => {
    const store = createMemoryStore()
    store.files.set('plan.md', SAMPLE_PLAN)

    const loader = createPlanLoader(store)
    const plan = await loader.load('plan.md')

    expect(plan.steps).toHaveLength(3)
    expect(loader.getPlan(plan.id)).toBeDefined()
    expect(loader.listPlans()).toHaveLength(1)
  })

  it('getStep() retrieves specific step', async () => {
    const store = createMemoryStore()
    store.files.set('plan.md', SAMPLE_PLAN)

    const loader = createPlanLoader(store)
    const plan = await loader.load('plan.md')
    const step = loader.getStep(plan.id, 'step-2')

    expect(step?.title).toBe('Implement scheduler')
  })

  it('getNextStep() returns first pending', async () => {
    const store = createMemoryStore()
    store.files.set('plan.md', SAMPLE_PLAN)

    const loader = createPlanLoader(store)
    const plan = await loader.load('plan.md')
    const next = loader.getNextStep(plan.id)

    expect(next?.id).toBe('step-1')
  })

  it('updateStep() updates step status in cache', async () => {
    const store = createMemoryStore()
    store.files.set('plan.md', SAMPLE_PLAN)

    const loader = createPlanLoader(store)
    const plan = await loader.load('plan.md')

    loader.updateStep(plan.id, 'step-1', 'completed')
    const next = loader.getNextStep(plan.id)

    expect(next?.id).toBe('step-2')
  })

  it('isCompleted() reflects step statuses', async () => {
    const store = createMemoryStore()
    store.files.set('plan.md', SAMPLE_PLAN)

    const loader = createPlanLoader(store)
    const plan = await loader.load('plan.md')

    expect(loader.isCompleted(plan.id)).toBe(false)

    loader.updateStep(plan.id, 'step-1', 'completed')
    loader.updateStep(plan.id, 'step-2', 'completed')
    loader.updateStep(plan.id, 'step-3', 'completed')

    expect(loader.isCompleted(plan.id)).toBe(true)
  })

  it('save() persists updated plan to store', async () => {
    const store = createMemoryStore()
    store.files.set('plan.md', SAMPLE_PLAN)

    const loader = createPlanLoader(store)
    const plan = await loader.load('plan.md')

    loader.updateStep(plan.id, 'step-1', 'completed')
    const updated = loader.getPlan(plan.id)!
    await loader.save(updated)

    // File should be updated in store
    const content = store.files.get('plan.md')!
    expect(content).toBeDefined()
  })

  it('load() throws for non-existent file', async () => {
    const store = createMemoryStore()
    const loader = createPlanLoader(store)

    await expect(loader.load('missing.md')).rejects.toThrow('File not found')
  })

  it('getStep() returns undefined for unknown plan', () => {
    const store = createMemoryStore()
    const loader = createPlanLoader(store)

    expect(loader.getStep('nonexistent', 'step-1')).toBeUndefined()
  })

  it('getNextStep() returns undefined for unknown plan', () => {
    const store = createMemoryStore()
    const loader = createPlanLoader(store)

    expect(loader.getNextStep('nonexistent')).toBeUndefined()
  })

  it('isCompleted() returns false for unknown plan', () => {
    const store = createMemoryStore()
    const loader = createPlanLoader(store)

    expect(loader.isCompleted('nonexistent')).toBe(false)
  })
})

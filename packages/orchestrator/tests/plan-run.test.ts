import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import {
  createMemoryPlanRunStore,
  createFilePlanRunStore,
  createPlanRun,
  updatePlanRunStep,
  isPlanRunCompleted,
  getNextPlanRunStep,
} from '../src/plan-run'
import type { PlanRun } from '../src/plan-run'

function makePlanRun(overrides: Partial<PlanRun> = {}): PlanRun {
  return createPlanRun({
    planId: overrides.planId ?? 'plan-1',
    planPath: overrides.planPath ?? 'test.md',
    sessionId: overrides.sessionId ?? 'session-1',
    steps: [
      { id: 'step-1', status: 'pending' },
      { id: 'step-2', status: 'pending' },
      { id: 'step-3', status: 'pending' },
    ],
    ...overrides,
  })
}

// ═══ 辅助函数测试 ═══

describe('PlanRun helpers', () => {
  it('createPlanRun initializes with correct fields', () => {
    const run = createPlanRun({
      planId: 'plan-x',
      planPath: 'plans/x.md',
      sessionId: 'sess-1',
      steps: [
        { id: 's1', status: 'pending' },
        { id: 's2', status: 'completed' },
      ],
    })

    expect(run.id).toBeDefined()
    expect(run.planId).toBe('plan-x')
    expect(run.sessionId).toBe('sess-1')
    expect(run.status).toBe('active')
    expect(run.stepStates).toHaveLength(2)
    expect(run.stepStates[0].stepId).toBe('s1')
    expect(run.stepStates[0].status).toBe('pending')
    expect(run.stepStates[1].status).toBe('completed')
    expect(run.startedAt).toBeGreaterThan(0)
  })

  it('updatePlanRunStep updates the target step', () => {
    const run = makePlanRun()
    const updated = updatePlanRunStep(run, 'step-2', {
      status: 'completed',
      taskId: 'task-abc',
      output: 'done',
    })

    expect(updated.stepStates[1].status).toBe('completed')
    expect(updated.stepStates[1].taskId).toBe('task-abc')
    expect(updated.stepStates[1].output).toBe('done')
    // Other steps unchanged
    expect(updated.stepStates[0].status).toBe('pending')
    expect(updated.stepStates[2].status).toBe('pending')
  })

  it('isPlanRunCompleted returns true when all steps completed', () => {
    let run = makePlanRun()
    run = updatePlanRunStep(run, 'step-1', { status: 'completed' })
    run = updatePlanRunStep(run, 'step-2', { status: 'completed' })
    run = updatePlanRunStep(run, 'step-3', { status: 'completed' })

    expect(isPlanRunCompleted(run)).toBe(true)
  })

  it('isPlanRunCompleted returns false with pending steps', () => {
    const run = makePlanRun()
    expect(isPlanRunCompleted(run)).toBe(false)
  })

  it('getNextPlanRunStep returns first pending step', () => {
    let run = makePlanRun()
    run = updatePlanRunStep(run, 'step-1', { status: 'completed' })

    const next = getNextPlanRunStep(run)
    expect(next?.stepId).toBe('step-2')
  })

  it('getNextPlanRunStep returns undefined when all done', () => {
    let run = makePlanRun()
    run = updatePlanRunStep(run, 'step-1', { status: 'completed' })
    run = updatePlanRunStep(run, 'step-2', { status: 'completed' })
    run = updatePlanRunStep(run, 'step-3', { status: 'completed' })

    expect(getNextPlanRunStep(run)).toBeUndefined()
  })
})

// ═══ Memory Store 测试 ═══

describe('createMemoryPlanRunStore', () => {
  it('save + get round-trips', async () => {
    const store = createMemoryPlanRunStore()
    const run = makePlanRun()

    await store.save(run)
    const retrieved = await store.get(run.id)

    expect(retrieved).toBeDefined()
    expect(retrieved!.planId).toBe(run.planId)
  })

  it('getBySession filters correctly', async () => {
    const store = createMemoryPlanRunStore()
    const run1 = makePlanRun({ sessionId: 'sess-a' } as Partial<PlanRun>)
    const run2 = makePlanRun({ sessionId: 'sess-b' } as Partial<PlanRun>)

    await store.save(run1)
    await store.save(run2)

    const results = await store.getBySession('sess-a')
    expect(results).toHaveLength(1)
    expect(results[0].sessionId).toBe('sess-a')
  })

  it('getByPlan filters correctly', async () => {
    const store = createMemoryPlanRunStore()
    const run1 = makePlanRun({ planId: 'plan-A' } as Partial<PlanRun>)
    const run2 = makePlanRun({ planId: 'plan-B' } as Partial<PlanRun>)

    await store.save(run1)
    await store.save(run2)

    const results = await store.getByPlan('plan-A')
    expect(results).toHaveLength(1)
    expect(results[0].planId).toBe('plan-A')
  })

  it('getActive finds matching active run', async () => {
    const store = createMemoryPlanRunStore()
    const run = makePlanRun({ planId: 'plan-A', sessionId: 'sess-1' } as Partial<PlanRun>)

    await store.save(run)

    const active = await store.getActive('plan-A', 'sess-1')
    expect(active).toBeDefined()
    expect(active!.id).toBe(run.id)
  })

  it('getActive returns undefined for non-matching', async () => {
    const store = createMemoryPlanRunStore()
    const run = makePlanRun({ planId: 'plan-A', sessionId: 'sess-1' } as Partial<PlanRun>)
    run.status = 'completed'

    await store.save(run)

    expect(await store.getActive('plan-A', 'sess-1')).toBeUndefined()
  })

  it('list returns all runs', async () => {
    const store = createMemoryPlanRunStore()
    await store.save(makePlanRun())
    await store.save(makePlanRun())

    const all = await store.list()
    expect(all).toHaveLength(2)
  })

  it('remove deletes run', async () => {
    const store = createMemoryPlanRunStore()
    const run = makePlanRun()
    await store.save(run)

    expect(await store.remove(run.id)).toBe(true)
    expect(await store.get(run.id)).toBeUndefined()
  })
})

// ═══ File Store 测试 ═══

describe('createFilePlanRunStore', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'plan-run-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('save + get round-trips via JSON', async () => {
    const store = createFilePlanRunStore({ directory: dir })
    const run = makePlanRun()

    await store.save(run)
    const retrieved = await store.get(run.id)

    expect(retrieved).toBeDefined()
    expect(retrieved!.planId).toBe(run.planId)
    expect(retrieved!.sessionId).toBe(run.sessionId)
    expect(retrieved!.stepStates).toHaveLength(3)
  })

  it('persists as .run.json file', async () => {
    const store = createFilePlanRunStore({ directory: dir })
    const run = makePlanRun()

    await store.save(run)

    const files = await readdir(dir)
    expect(files.some(f => f.endsWith('.run.json'))).toBe(true)

    const content = JSON.parse(await readFile(join(dir, files[0]), 'utf-8'))
    expect(content.version).toBe(1)
    expect(content.run.id).toBe(run.id)
  })

  it('getBySession filters persisted runs', async () => {
    const store = createFilePlanRunStore({ directory: dir })
    const run1 = makePlanRun({ sessionId: 'sess-x' } as Partial<PlanRun>)
    const run2 = makePlanRun({ sessionId: 'sess-y' } as Partial<PlanRun>)

    await store.save(run1)
    await store.save(run2)

    const results = await store.getBySession('sess-x')
    expect(results).toHaveLength(1)
    expect(results[0].sessionId).toBe('sess-x')
  })

  it('getActive finds active run by plan+session', async () => {
    const store = createFilePlanRunStore({ directory: dir })
    const run = makePlanRun({ planId: 'plan-Z', sessionId: 'sess-Z' } as Partial<PlanRun>)

    await store.save(run)

    const active = await store.getActive('plan-Z', 'sess-Z')
    expect(active).toBeDefined()
    expect(active!.status).toBe('active')
  })

  it('list returns all persisted runs', async () => {
    const store = createFilePlanRunStore({ directory: dir })
    await store.save(makePlanRun())
    await store.save(makePlanRun())

    const all = await store.list()
    expect(all).toHaveLength(2)
  })

  it('remove deletes .run.json file', async () => {
    const store = createFilePlanRunStore({ directory: dir })
    const run = makePlanRun()

    await store.save(run)
    expect(await store.remove(run.id)).toBe(true)
    expect(await store.get(run.id)).toBeUndefined()

    const files = await readdir(dir)
    expect(files.filter(f => f.endsWith('.run.json'))).toHaveLength(0)
  })

  it('get returns undefined for non-existent id', async () => {
    const store = createFilePlanRunStore({ directory: dir })
    expect(await store.get('nonexistent')).toBeUndefined()
  })
})

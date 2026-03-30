import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LocalPlanStore, createLocalPlanStore } from '../src/plan-store'
import type { Plan, PlanTask } from '../src/types'

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    version: 1,
    name: 'Test Plan',
    goal: 'Build something',
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
    title: 'Task 1',
    description: 'Do something',
    type: 'code_generation',
    status: 'pending',
    attempts: 0,
    ...overrides,
  }
}

describe('LocalPlanStore', () => {
  let baseDir: string
  let store: LocalPlanStore

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'plan-store-test-'))
    store = new LocalPlanStore({ baseDir })
  })

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true })
  })

  describe('create', () => {
    it('persists plan and returns it with version=1', async () => {
      const plan = makePlan({ id: 'abc' })
      const saved = await store.create(plan)

      expect(saved.id).toBe('abc')
      expect(saved.version).toBe(1)

      const loaded = await store.get('abc')
      expect(loaded).toBeDefined()
      expect(loaded!.name).toBe('Test Plan')
    })

    it('generates id when empty', async () => {
      const plan = makePlan({ id: '' })
      const saved = await store.create(plan)

      expect(saved.id).toBeTruthy()
      expect(saved.id.length).toBeGreaterThan(0)
    })

    it('pauses existing active plan for same session', async () => {
      await store.create(makePlan({ id: 'p1', sessionId: 'sess-1', status: 'active' }))
      await store.create(makePlan({ id: 'p2', sessionId: 'sess-1', status: 'active' }))

      const p1 = await store.get('p1')
      expect(p1!.status).toBe('paused')

      const p2 = await store.get('p2')
      expect(p2!.status).toBe('active')
    })

    it('does not pause plans from different sessions', async () => {
      await store.create(makePlan({ id: 'p1', sessionId: 'sess-1', status: 'active' }))
      await store.create(makePlan({ id: 'p2', sessionId: 'sess-2', status: 'active' }))

      const p1 = await store.get('p1')
      expect(p1!.status).toBe('active')
    })
  })

  describe('get', () => {
    it('returns undefined for missing plan', async () => {
      const plan = await store.get('nonexistent')
      expect(plan).toBeUndefined()
    })
  })

  describe('getMarkdown', () => {
    it('returns raw Markdown string for existing plan', async () => {
      await store.create(makePlan({ id: 'p1', name: 'My Plan', goal: 'Do things' }))
      const md = await store.getMarkdown('p1')

      expect(md).toBeDefined()
      expect(md).toContain('---')
      expect(md).toContain('id: p1')
      expect(md).toContain('# My Plan')
      expect(md).toContain('## Goal')
      expect(md).toContain('Do things')
    })

    it('returns undefined for missing plan', async () => {
      const md = await store.getMarkdown('nope')
      expect(md).toBeUndefined()
    })

    it('includes task details in Markdown', async () => {
      const tasks = [makeTask({ id: 't1', title: 'Task One', status: 'completed' })]
      await store.create(makePlan({ id: 'p1', tasks }))
      const md = await store.getMarkdown('p1')

      expect(md).toContain('### t1: Task One [completed]')
    })
  })

  describe('update', () => {
    it('increments version on each update', async () => {
      await store.create(makePlan({ id: 'p1' }))
      const updated = await store.update('p1', { name: 'New Name' })

      expect(updated.version).toBe(2)
      expect(updated.name).toBe('New Name')
    })

    it('preserves id even if patch tries to override', async () => {
      await store.create(makePlan({ id: 'p1' }))
      const updated = await store.update('p1', { id: 'hacked' } as Partial<Plan>)
      expect(updated.id).toBe('p1')
    })

    it('sets completedAt when status changes to completed', async () => {
      await store.create(makePlan({ id: 'p1' }))
      const updated = await store.update('p1', { status: 'completed' })

      expect(updated.status).toBe('completed')
      expect(updated.completedAt).toBeGreaterThan(0)
    })

    it('throws for nonexistent plan', async () => {
      await expect(store.update('nope', { name: 'x' })).rejects.toThrow('not found')
    })
  })

  describe('delete', () => {
    it('removes plan file', async () => {
      await store.create(makePlan({ id: 'p1' }))
      const deleted = await store.delete('p1')
      expect(deleted).toBe(true)

      const loaded = await store.get('p1')
      expect(loaded).toBeUndefined()
    })

    it('returns false for nonexistent plan', async () => {
      const deleted = await store.delete('nope')
      expect(deleted).toBe(false)
    })
  })

  describe('listBySession', () => {
    it('filters plans by sessionId', async () => {
      await store.create(makePlan({ id: 'p1', sessionId: 'sess-a' }))
      await store.create(makePlan({ id: 'p2', sessionId: 'sess-b' }))
      await store.create(makePlan({ id: 'p3', sessionId: 'sess-a', status: 'draft' }))

      const list = await store.listBySession('sess-a')
      expect(list).toHaveLength(2)
      expect(list.map(p => p.id).sort()).toEqual(['p1', 'p3'])
    })
  })

  describe('listByStatus', () => {
    it('filters plans by status', async () => {
      await store.create(makePlan({ id: 'p1', status: 'active' }))
      await store.create(makePlan({ id: 'p2', status: 'draft' }))

      const active = await store.listByStatus('active')
      // p1 was paused when p2 was created because they share session, but p2 is draft
      // Actually p2 is draft so only active p1 stays... wait, p2 is draft not active so p1 stays active
      expect(active.some(p => p.id === 'p1')).toBe(true)

      const drafts = await store.listByStatus('draft')
      expect(drafts.some(p => p.id === 'p2')).toBe(true)
    })
  })

  describe('getActive', () => {
    it('returns active plan for session', async () => {
      await store.create(makePlan({ id: 'p1', sessionId: 's1', status: 'active' }))
      await store.create(makePlan({ id: 'p2', sessionId: 's1', status: 'draft' }))

      const active = await store.getActive('s1')
      expect(active).toBeDefined()
      expect(active!.id).toBe('p1')
    })

    it('returns undefined when no active plan', async () => {
      const active = await store.getActive('s-none')
      expect(active).toBeUndefined()
    })
  })

  describe('updateTask', () => {
    it('updates a specific task within a plan', async () => {
      const tasks = [makeTask({ id: 't1' }), makeTask({ id: 't2', title: 'Task 2' })]
      await store.create(makePlan({ id: 'p1', tasks }))

      const updated = await store.updateTask('p1', 't1', { status: 'running' })
      const task = updated.tasks.find(t => t.id === 't1')
      expect(task!.status).toBe('running')
    })

    it('does not allow overriding task id in patch', async () => {
      await store.create(makePlan({ id: 'p1', tasks: [makeTask({ id: 't1' })] }))
      const updated = await store.updateTask('p1', 't1', { id: 'hacked' } as Partial<PlanTask>)
      expect(updated.tasks[0].id).toBe('t1')
    })

    it('auto-completes plan when all tasks are completed', async () => {
      const tasks = [
        makeTask({ id: 't1', status: 'completed' }),
        makeTask({ id: 't2', status: 'running' }),
      ]
      await store.create(makePlan({ id: 'p1', tasks, status: 'active' }))

      const updated = await store.updateTask('p1', 't2', { status: 'completed' })
      expect(updated.status).toBe('completed')
      expect(updated.completedAt).toBeGreaterThan(0)
    })

    it('auto-promotes pending tasks to ready when dependencies complete', async () => {
      const tasks = [
        makeTask({ id: 't1', status: 'running' }),
        makeTask({ id: 't2', status: 'pending', dependencies: ['t1'] }),
        makeTask({ id: 't3', status: 'pending', dependencies: ['t2'] }),
      ]
      await store.create(makePlan({ id: 'p1', tasks }))

      const updated = await store.updateTask('p1', 't1', { status: 'completed' })
      const t2 = updated.tasks.find(t => t.id === 't2')
      const t3 = updated.tasks.find(t => t.id === 't3')

      expect(t2!.status).toBe('ready')
      expect(t3!.status).toBe('pending') // still has unmet dep on t2
    })

    it('throws for nonexistent task', async () => {
      await store.create(makePlan({ id: 'p1', tasks: [makeTask()] }))
      await expect(store.updateTask('p1', 'nonexistent', {})).rejects.toThrow('not found')
    })
  })

  describe('getReadyTasks', () => {
    it('returns tasks whose dependencies are all satisfied', async () => {
      const tasks = [
        makeTask({ id: 't1', status: 'completed' }),
        makeTask({ id: 't2', status: 'pending', dependencies: ['t1'] }),
        makeTask({ id: 't3', status: 'pending', dependencies: ['t1', 't2'] }),
      ]
      await store.create(makePlan({ id: 'p1', tasks }))

      const ready = await store.getReadyTasks('p1')
      expect(ready).toHaveLength(1)
      expect(ready[0].id).toBe('t2')
    })

    it('returns empty for nonexistent plan', async () => {
      const ready = await store.getReadyTasks('nope')
      expect(ready).toEqual([])
    })
  })

  describe('getVersion', () => {
    it('returns 0 for nonexistent plan', async () => {
      const version = await store.getVersion('nope')
      expect(version).toBe(0)
    })

    it('tracks version across updates', async () => {
      await store.create(makePlan({ id: 'p1' }))
      expect(await store.getVersion('p1')).toBe(1)

      await store.update('p1', { name: 'v2' })
      expect(await store.getVersion('p1')).toBe(2)
    })
  })
})

describe('createLocalPlanStore', () => {
  it('returns a valid PlanStore instance', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'plan-factory-'))
    try {
      const store = createLocalPlanStore({ baseDir: dir })
      expect(store).toBeInstanceOf(LocalPlanStore)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

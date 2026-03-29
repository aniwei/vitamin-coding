import { describe, it, expect } from 'vitest'
import { createMemoryCheckpointStore } from '../src/checkpoint-store'
import type { Checkpoint } from '../src/checkpoint-store'
import type { OrchestratorTask } from '../src/types'

function makeTask(id: string, prompt: string = 'test'): OrchestratorTask {
  return {
    id,
    kind: 'delegate',
    status: 'completed',
    mode: 'sync',
    input: { prompt },
    attempts: 1,
    maxAttempts: 3,
    correlationId: `corr-${id}`,
    createdAt: Date.now(),
  }
}

function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  const id = overrides.id ?? crypto.randomUUID()
  return {
    id,
    taskId: overrides.taskId ?? `task-${id}`,
    planId: overrides.planId,
    stepId: overrides.stepId,
    task: overrides.task ?? makeTask(overrides.taskId ?? id),
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? Date.now(),
  }
}

describe('createMemoryCheckpointStore', () => {
  it('save() and get() by taskId', async () => {
    const store = createMemoryCheckpointStore()
    const cp = makeCheckpoint({ taskId: 'task-1' })

    await store.save(cp)
    const retrieved = await store.get('task-1')

    expect(retrieved).toBeDefined()
    expect(retrieved!.taskId).toBe('task-1')
  })

  it('get() returns undefined for non-existent taskId', async () => {
    const store = createMemoryCheckpointStore()
    expect(await store.get('nonexistent')).toBeUndefined()
  })

  it('getLatest() returns most recent checkpoint for planId', async () => {
    const store = createMemoryCheckpointStore()

    await store.save(makeCheckpoint({
      id: 'cp-1',
      taskId: 'task-1',
      planId: 'plan-A',
      createdAt: 1000,
    }))
    await store.save(makeCheckpoint({
      id: 'cp-2',
      taskId: 'task-2',
      planId: 'plan-A',
      createdAt: 2000,
    }))
    await store.save(makeCheckpoint({
      id: 'cp-3',
      taskId: 'task-3',
      planId: 'plan-B',
      createdAt: 3000,
    }))

    const latest = await store.getLatest('plan-A')
    expect(latest).toBeDefined()
    expect(latest!.id).toBe('cp-2')
  })

  it('getLatest() returns undefined for unknown planId', async () => {
    const store = createMemoryCheckpointStore()
    expect(await store.getLatest('unknown')).toBeUndefined()
  })

  it('list() returns all checkpoints sorted by createdAt', async () => {
    const store = createMemoryCheckpointStore()

    await store.save(makeCheckpoint({ id: 'b', createdAt: 2000 }))
    await store.save(makeCheckpoint({ id: 'a', createdAt: 1000 }))
    await store.save(makeCheckpoint({ id: 'c', createdAt: 3000 }))

    const all = await store.list()
    expect(all).toHaveLength(3)
    expect(all[0].id).toBe('a')
    expect(all[1].id).toBe('b')
    expect(all[2].id).toBe('c')
  })

  it('list() filters by planId', async () => {
    const store = createMemoryCheckpointStore()

    await store.save(makeCheckpoint({ id: '1', planId: 'A', createdAt: 1 }))
    await store.save(makeCheckpoint({ id: '2', planId: 'B', createdAt: 2 }))
    await store.save(makeCheckpoint({ id: '3', planId: 'A', createdAt: 3 }))

    const filtered = await store.list({ planId: 'A' })
    expect(filtered).toHaveLength(2)
    expect(filtered.every(cp => cp.planId === 'A')).toBe(true)
  })

  it('list() filters by taskId', async () => {
    const store = createMemoryCheckpointStore()

    await store.save(makeCheckpoint({ id: '1', taskId: 't1', createdAt: 1 }))
    await store.save(makeCheckpoint({ id: '2', taskId: 't2', createdAt: 2 }))

    const filtered = await store.list({ taskId: 't1' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].taskId).toBe('t1')
  })

  it('list() with both filters applies AND logic', async () => {
    const store = createMemoryCheckpointStore()

    await store.save(makeCheckpoint({ id: '1', taskId: 't1', planId: 'A', createdAt: 1 }))
    await store.save(makeCheckpoint({ id: '2', taskId: 't2', planId: 'A', createdAt: 2 }))
    await store.save(makeCheckpoint({ id: '3', taskId: 't1', planId: 'B', createdAt: 3 }))

    const filtered = await store.list({ taskId: 't1', planId: 'A' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('1')
  })

  it('remove() deletes by id', async () => {
    const store = createMemoryCheckpointStore()

    await store.save(makeCheckpoint({ id: 'cp-1', taskId: 't1' }))
    expect(await store.remove('cp-1')).toBe(true)
    expect(await store.get('t1')).toBeUndefined()
  })

  it('remove() returns false for non-existent id', async () => {
    const store = createMemoryCheckpointStore()
    expect(await store.remove('nonexistent')).toBe(false)
  })

  it('clear() removes all checkpoints', async () => {
    const store = createMemoryCheckpointStore()

    await store.save(makeCheckpoint({ id: '1', createdAt: 1 }))
    await store.save(makeCheckpoint({ id: '2', createdAt: 2 }))

    await store.clear()
    const all = await store.list()
    expect(all).toHaveLength(0)
  })

  it('save() overwrites existing checkpoint with same id', async () => {
    const store = createMemoryCheckpointStore()

    await store.save(makeCheckpoint({
      id: 'cp-1',
      taskId: 'old-task',
      metadata: { version: 1 },
    }))
    await store.save(makeCheckpoint({
      id: 'cp-1',
      taskId: 'new-task',
      metadata: { version: 2 },
    }))

    const all = await store.list()
    expect(all).toHaveLength(1)
    expect(all[0].taskId).toBe('new-task')
  })
})

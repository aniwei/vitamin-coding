import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createFileCheckpointStore } from '../src/checkpoint-store'
import type { Checkpoint } from '../src/checkpoint-store'
import type { OrchestratorTask } from '../src/types'

function makeTask(id: string): OrchestratorTask {
  return {
    id,
    kind: 'delegate',
    status: 'completed',
    mode: 'sync',
    input: { prompt: 'test' },
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
    sessionId: overrides.sessionId,
    planId: overrides.planId,
    stepId: overrides.stepId,
    task: overrides.task ?? makeTask(overrides.taskId ?? id),
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? Date.now(),
  }
}

describe('createFileCheckpointStore', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'checkpoint-fs-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('save + get round-trips via JSON', async () => {
    const store = createFileCheckpointStore({ directory: dir })
    const cp = makeCheckpoint({ taskId: 'task-1', sessionId: 'sess-1' })

    await store.save(cp)
    const retrieved = await store.get('task-1')

    expect(retrieved).toBeDefined()
    expect(retrieved!.taskId).toBe('task-1')
    expect(retrieved!.sessionId).toBe('sess-1')
  })

  it('persists as .checkpoint.json file', async () => {
    const store = createFileCheckpointStore({ directory: dir })
    const cp = makeCheckpoint()

    await store.save(cp)

    const files = await readdir(dir)
    expect(files.some(f => f.endsWith('.checkpoint.json'))).toBe(true)

    const content = JSON.parse(await readFile(join(dir, files[0]), 'utf-8'))
    expect(content.version).toBe(1)
    expect(content.checkpoint.id).toBe(cp.id)
  })

  it('getLatest returns most recent for planId', async () => {
    const store = createFileCheckpointStore({ directory: dir })

    await store.save(makeCheckpoint({ id: 'cp-1', planId: 'plan-A', createdAt: 1000 }))
    await store.save(makeCheckpoint({ id: 'cp-2', planId: 'plan-A', createdAt: 2000 }))
    await store.save(makeCheckpoint({ id: 'cp-3', planId: 'plan-B', createdAt: 3000 }))

    const latest = await store.getLatest('plan-A')
    expect(latest).toBeDefined()
    expect(latest!.id).toBe('cp-2')
  })

  it('getBySession returns checkpoints for session', async () => {
    const store = createFileCheckpointStore({ directory: dir })

    await store.save(makeCheckpoint({ id: 'cp-1', sessionId: 'sess-A', createdAt: 1 }))
    await store.save(makeCheckpoint({ id: 'cp-2', sessionId: 'sess-B', createdAt: 2 }))
    await store.save(makeCheckpoint({ id: 'cp-3', sessionId: 'sess-A', createdAt: 3 }))

    const results = await store.getBySession('sess-A')
    expect(results).toHaveLength(2)
    expect(results.every(cp => cp.sessionId === 'sess-A')).toBe(true)
    // Sorted by createdAt
    expect(results[0].id).toBe('cp-1')
    expect(results[1].id).toBe('cp-3')
  })

  it('list filters by sessionId', async () => {
    const store = createFileCheckpointStore({ directory: dir })

    await store.save(makeCheckpoint({ id: 'cp-1', sessionId: 'sess-1', createdAt: 1 }))
    await store.save(makeCheckpoint({ id: 'cp-2', sessionId: 'sess-2', createdAt: 2 }))

    const filtered = await store.list({ sessionId: 'sess-1' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].sessionId).toBe('sess-1')
  })

  it('list without filter returns all sorted', async () => {
    const store = createFileCheckpointStore({ directory: dir })

    await store.save(makeCheckpoint({ id: 'b', createdAt: 2000 }))
    await store.save(makeCheckpoint({ id: 'a', createdAt: 1000 }))

    const all = await store.list()
    expect(all).toHaveLength(2)
    expect(all[0].id).toBe('a')
    expect(all[1].id).toBe('b')
  })

  it('remove deletes .checkpoint.json file', async () => {
    const store = createFileCheckpointStore({ directory: dir })
    const cp = makeCheckpoint()

    await store.save(cp)
    expect(await store.remove(cp.id)).toBe(true)

    const files = await readdir(dir)
    expect(files.filter(f => f.endsWith('.checkpoint.json'))).toHaveLength(0)
  })

  it('remove returns false for non-existent', async () => {
    const store = createFileCheckpointStore({ directory: dir })
    expect(await store.remove('nonexistent')).toBe(false)
  })

  it('clear removes all checkpoint files', async () => {
    const store = createFileCheckpointStore({ directory: dir })

    await store.save(makeCheckpoint({ id: 'cp-1', createdAt: 1 }))
    await store.save(makeCheckpoint({ id: 'cp-2', createdAt: 2 }))

    await store.clear()

    const files = await readdir(dir)
    expect(files.filter(f => f.endsWith('.checkpoint.json'))).toHaveLength(0)
    expect(await store.list()).toHaveLength(0)
  })

  it('get returns undefined for non-existent taskId', async () => {
    const store = createFileCheckpointStore({ directory: dir })
    expect(await store.get('nonexistent')).toBeUndefined()
  })

  it('auto-creates directory on first save', async () => {
    const nestedDir = join(dir, 'nested', 'checkpoints')
    const store = createFileCheckpointStore({ directory: nestedDir })

    await store.save(makeCheckpoint())
    const files = await readdir(nestedDir)
    expect(files.length).toBe(1)
  })
})

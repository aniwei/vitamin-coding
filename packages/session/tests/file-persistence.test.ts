import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DiskSessionPersistence, createDiskSessionPersistence } from '../src/file-persistence'

describe('DiskSessionPersistence', () => {
  let tempDir: string
  let persistence: DiskSessionPersistence<string>

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'vitamin-session-test-'))
    persistence = new DiskSessionPersistence<string>({ baseDir: tempDir })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('#when saving and loading', () => {
    it('#then snapshot is persisted and recovered', async () => {
      await persistence.save({
        version: 1,
        id: 'test-session',
        entries: [
          { type: 'message', id: 'e1', message: 'hello', timestamp: 1000 },
          { type: 'message', id: 'e2', parentId: 'e1', message: 'world', timestamp: 2000 },
        ],
        metadata: {
          createdAt: 1000,
          lastActiveAt: 2000,
          messageCount: 2,
          compactionCount: 0,
          tags: ['test'],
        },
        leafId: 'e2',
      })

      const loaded = await persistence.load('test-session')
      expect(loaded).not.toBeNull()
      expect(loaded?.id).toBe('test-session')
      expect(loaded?.entries).toHaveLength(2)
      expect(loaded?.metadata.tags).toEqual(['test'])
    })
  })

  describe('#when loading nonexistent', () => {
    it('#then returns null', async () => {
      const result = await persistence.load('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('#when listing', () => {
    it('#then returns all saved session ids', async () => {
      await persistence.save({ version: 1, id: 'a', entries: [], metadata: { createdAt: 0, lastActiveAt: 0, messageCount: 0, compactionCount: 0, tags: [] } })
      await persistence.save({ version: 1, id: 'b', entries: [], metadata: { createdAt: 0, lastActiveAt: 0, messageCount: 0, compactionCount: 0, tags: [] } })

      const ids = await persistence.list()
      expect(ids).toContain('a')
      expect(ids).toContain('b')
      expect(ids).toHaveLength(2)
    })
  })

  describe('#when deleting', () => {
    it('#then removes the persisted session', async () => {
      await persistence.save({ version: 1, id: 'del-me', entries: [], metadata: { createdAt: 0, lastActiveAt: 0, messageCount: 0, compactionCount: 0, tags: [] } })

      const deleted = await persistence.delete('del-me')
      expect(deleted).toBe(true)

      const loaded = await persistence.load('del-me')
      expect(loaded).toBeNull()
    })

    it('#then returns false for nonexistent', async () => {
      expect(await persistence.delete('nope')).toBe(false)
    })
  })

  describe('#when id contains path traversal characters', () => {
    it('#then round-trips the id safely', async () => {
      await persistence.save({ version: 1, id: '../evil', entries: [], metadata: { createdAt: 0, lastActiveAt: 0, messageCount: 0, compactionCount: 0, tags: [] } })

      const ids = await persistence.list()
      expect(ids).toHaveLength(1)
      expect(ids[0]).toBe('../evil')

      const loaded = await persistence.load('../evil')
      expect(loaded?.id).toBe('../evil')
    })
  })

  describe('#when loading preserves all snapshot fields', () => {
    it('#then version, leafId, entry id and parentId are preserved', async () => {
      await persistence.save({
        version: 1,
        id: 'full-snap',
        entries: [
          { type: 'message', id: 'e1', message: 'a', timestamp: 100 },
          { type: 'message', id: 'e2', parentId: 'e1', message: 'b', timestamp: 200 },
          { type: 'compaction', id: 'e3', parentId: 'e2', summary: 'sum', compactedCount: 1, timestamp: 300 },
        ],
        metadata: { createdAt: 100, lastActiveAt: 300, messageCount: 2, compactionCount: 1, tags: ['v1'] },
        leafId: 'e3',
      })

      const loaded = await persistence.load('full-snap')
      expect(loaded).not.toBeNull()
      expect(loaded?.version).toBe(1)
      expect(loaded?.leafId).toBe('e3')
      expect(loaded?.entries[0]?.id).toBe('e1')
      expect(loaded?.entries[0]?.parentId).toBeUndefined()
      expect(loaded?.entries[1]?.id).toBe('e2')
      expect(loaded?.entries[1]?.parentId).toBe('e1')
      expect(loaded?.entries[2]?.type).toBe('compaction')
      expect(loaded?.entries[2]?.id).toBe('e3')
    })
  })

  describe('#createDiskSessionPersistence factory', () => {
    it('#then returns working persistence', async () => {
      const persistenceFromFactory = createDiskSessionPersistence<string>({ baseDir: tempDir })
      await persistenceFromFactory.save({ version: 1, id: 'factory-test', entries: [], metadata: { createdAt: 0, lastActiveAt: 0, messageCount: 0, compactionCount: 0, tags: [] } })

      const ids = await persistenceFromFactory.list()
      expect(ids).toContain('factory-test')
    })
  })
})

describe('DiskSessionPersistence#listPaginated', () => {
  let tempDir: string
  let persistence: DiskSessionPersistence<string>

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'vitamin-session-page-'))
    persistence = new DiskSessionPersistence<string>({ baseDir: tempDir })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('#then paginates file-based session list', async () => {
    for (let i = 0; i < 5; i++) {
      await persistence.save({
        version: 1,
        id: `page-${i}`,
        entries: [],
        metadata: {
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
          messageCount: 0,
          compactionCount: 0,
          tags: [],
        },
      })

      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    const page0 = await persistence.listPaginated({ page: 0, pageSize: 2 })
    expect(page0.items).toHaveLength(2)
    expect(page0.total).toBe(5)
    expect(page0.totalPages).toBe(3)
    expect(page0.hasNext).toBe(true)
    expect(page0.hasPrevious).toBe(false)

    const page1 = await persistence.listPaginated({ page: 1, pageSize: 2 })
    expect(page1.items).toHaveLength(2)
    expect(page1.hasPrevious).toBe(true)

    const page2 = await persistence.listPaginated({ page: 2, pageSize: 2 })
    expect(page2.items).toHaveLength(1)
    expect(page2.hasNext).toBe(false)
  })

  it('#then returns empty result for no sessions', async () => {
    const result = await persistence.listPaginated({ page: 0, pageSize: 10 })
    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
    expect(result.totalPages).toBe(1)
  })
})

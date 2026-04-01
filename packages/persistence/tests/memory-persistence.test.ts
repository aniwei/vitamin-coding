import { describe, expect, it, beforeEach } from 'vitest'
import { MemoryPersistence } from '../src/memory-persistence'
import type { Snapshot } from '../src/types'

function makeSnapshot<T>(id: string, data: T, updatedAt = Date.now()): Snapshot<T> {
  return {
    version: 1,
    id,
    data,
    metadata: {
      createdAt: updatedAt - 1000,
      updatedAt,
      tags: [],
    },
  }
}

describe('MemoryPersistence', () => {
  let persistence: MemoryPersistence<string>

  beforeEach(() => {
    persistence = new MemoryPersistence<string>()
  })

  describe('save and load', () => {
    it('persists and recovers a snapshot', async () => {
      const snapshot = makeSnapshot('s1', 'hello')
      await persistence.save(snapshot)

      const loaded = await persistence.load('s1')
      expect(loaded).not.toBeNull()
      expect(loaded!.id).toBe('s1')
      expect(loaded!.data).toBe('hello')
    })

    it('returns a deep clone (not the same reference)', async () => {
      const snapshot = makeSnapshot('s1', 'hello')
      await persistence.save(snapshot)

      const a = await persistence.load('s1')
      const b = await persistence.load('s1')
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
    })

    it('overwrites existing snapshot on re-save', async () => {
      await persistence.save(makeSnapshot('s1', 'v1'))
      await persistence.save(makeSnapshot('s1', 'v2'))

      const loaded = await persistence.load('s1')
      expect(loaded!.data).toBe('v2')
    })
  })

  describe('load nonexistent', () => {
    it('returns null', async () => {
      expect(await persistence.load('nonexistent')).toBeNull()
    })
  })

  describe('delete', () => {
    it('removes a persisted snapshot', async () => {
      await persistence.save(makeSnapshot('d1', 'data'))

      expect(await persistence.delete('d1')).toBe(true)
      expect(await persistence.load('d1')).toBeNull()
    })

    it('returns false for nonexistent', async () => {
      expect(await persistence.delete('nope')).toBe(false)
    })
  })

  describe('list', () => {
    it('returns all saved ids', async () => {
      await persistence.save(makeSnapshot('a', 'x'))
      await persistence.save(makeSnapshot('b', 'y'))

      const ids = await persistence.list()
      expect(ids).toContain('a')
      expect(ids).toContain('b')
      expect(ids).toHaveLength(2)
    })

    it('returns empty array when nothing saved', async () => {
      expect(await persistence.list()).toEqual([])
    })
  })

  describe('listPaginated', () => {
    it('paginates results correctly', async () => {
      const now = Date.now()
      await persistence.save(makeSnapshot('c', 'x', now - 2000))
      await persistence.save(makeSnapshot('a', 'x', now))
      await persistence.save(makeSnapshot('b', 'x', now - 1000))

      const page0 = await persistence.listPaginated({ page: 0, pageSize: 2 })
      expect(page0.items).toHaveLength(2)
      expect(page0.total).toBe(3)
      expect(page0.totalPages).toBe(2)
      expect(page0.hasNext).toBe(true)
      expect(page0.hasPrevious).toBe(false)

      const page1 = await persistence.listPaginated({ page: 1, pageSize: 2 })
      expect(page1.items).toHaveLength(1)
      expect(page1.hasNext).toBe(false)
      expect(page1.hasPrevious).toBe(true)
    })

    it('sorts by updatedAt descending by default', async () => {
      const now = Date.now()
      await persistence.save(makeSnapshot('old', 'x', now - 2000))
      await persistence.save(makeSnapshot('new', 'x', now))
      await persistence.save(makeSnapshot('mid', 'x', now - 1000))

      const result = await persistence.listPaginated({ page: 0 })
      expect(result.items[0]).toBe('new')
      expect(result.items[1]).toBe('mid')
      expect(result.items[2]).toBe('old')
    })

    it('supports ascending order', async () => {
      const now = Date.now()
      await persistence.save(makeSnapshot('old', 'x', now - 2000))
      await persistence.save(makeSnapshot('new', 'x', now))

      const result = await persistence.listPaginated({ page: 0, order: 'asc' })
      expect(result.items[0]).toBe('old')
      expect(result.items[1]).toBe('new')
    })
  })
})

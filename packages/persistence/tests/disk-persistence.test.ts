import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DiskPersistence } from '../src/disk-persistence'
import type { Snapshot } from '../src/types'

class TestDiskPersistence<T> extends DiskPersistence<Snapshot<T>> {
  protected extractId(snapshot: Snapshot<T>): string {
    return snapshot.id
  }
}

function makeSnapshot<T>(id: string, data: T): Snapshot<T> {
  const now = Date.now()
  return {
    version: 1,
    id,
    data,
    metadata: {
      createdAt: now,
      updatedAt: now,
      tags: [],
    },
  }
}

describe('DiskPersistence', () => {
  let tempDir: string
  let persistence: TestDiskPersistence<string>

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'x-mars-persistence-test-'))
    persistence = new TestDiskPersistence<string>({ baseDir: tempDir })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('save and load', () => {
    it('persists and recovers a snapshot from disk', async () => {
      const snapshot = makeSnapshot('test-1', 'hello')
      await persistence.save(snapshot)

      const loaded = await persistence.load('test-1')
      expect(loaded).not.toBeNull()
      expect(loaded!.id).toBe('test-1')
      expect(loaded!.data).toBe('hello')
      expect(loaded!.version).toBe(1)
    })

    it('writes atomic JSON files (no .tmp remnants)', async () => {
      await persistence.save(makeSnapshot('atomic-test', 'data'))

      const files = await readdir(tempDir)
      const tmpFiles = files.filter((f) => f.endsWith('.tmp'))
      expect(tmpFiles).toHaveLength(0)

      const jsonFiles = files.filter((f) => f.endsWith('.json'))
      expect(jsonFiles).toHaveLength(1)
    })

    it('overwrites existing snapshot', async () => {
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
    it('removes the persisted file', async () => {
      await persistence.save(makeSnapshot('del-me', 'data'))

      expect(await persistence.delete('del-me')).toBe(true)
      expect(await persistence.load('del-me')).toBeNull()
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

    it('returns empty when directory is empty', async () => {
      expect(await persistence.list()).toEqual([])
    })
  })

  describe('listPaginated', () => {
    it('paginates results', async () => {
      await persistence.save(makeSnapshot('p1', 'x'))
      await persistence.save(makeSnapshot('p2', 'x'))
      await persistence.save(makeSnapshot('p3', 'x'))

      const result = await persistence.listPaginated({ page: 0, pageSize: 2 })
      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(3)
      expect(result.totalPages).toBe(2)
      expect(result.hasNext).toBe(true)
    })
  })

  describe('custom extension', () => {
    it('uses the provided file extension', async () => {
      const custom = new TestDiskPersistence<string>({
        baseDir: tempDir,
        extension: '.snap',
      })

      await custom.save(makeSnapshot('ext-test', 'data'))

      const files = await readdir(tempDir)
      expect(files.some((f) => f.endsWith('.snap'))).toBe(true)

      const loaded = await custom.load('ext-test')
      expect(loaded!.data).toBe('data')
    })
  })

  describe('custom codec', () => {
    it('uses custom encode/decode when provided', async () => {
      const codec = {
        encode(snapshot: Snapshot<string>): string {
          return `CUSTOM:${JSON.stringify(snapshot)}`
        },
        decode(payload: string): Snapshot<string> {
          const raw = payload.replace(/^CUSTOM:/, '')
          return JSON.parse(raw) as Snapshot<string>
        },
      }

      const custom = new TestDiskPersistence<string>({
        baseDir: tempDir,
        extension: '.snap',
        codec,
      })

      await custom.save(makeSnapshot('codec-test', 'payload'))

      const filePath = join(tempDir, 'codec-test.snap')
      const raw = await readFile(filePath, 'utf-8')
      expect(raw.startsWith('CUSTOM:')).toBe(true)

      const loaded = await custom.load('codec-test')
      expect(loaded).not.toBeNull()
      expect(loaded!.data).toBe('payload')
    })
  })

  describe('id sanitization', () => {
    it('sanitizes ids with path separators', async () => {
      await persistence.save(makeSnapshot('foo/bar:baz', 'safe'))

      const loaded = await persistence.load('foo/bar:baz')
      expect(loaded).not.toBeNull()
      expect(loaded!.data).toBe('safe')
    })
  })

  describe('auto-creates base directory', () => {
    it('creates nested directories', async () => {
      const nestedDir = join(tempDir, 'deep', 'nested', 'dir')
      const nested = new TestDiskPersistence<string>({ baseDir: nestedDir })

      await nested.save(makeSnapshot('nested-test', 'data'))
      const loaded = await nested.load('nested-test')
      expect(loaded!.data).toBe('data')
    })
  })
})

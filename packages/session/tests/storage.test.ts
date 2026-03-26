import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionStorage } from '../src/storage'

describe('createSessionStorage', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'vitamin-storage-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('#then creates local storage from options', async () => {
    const storage = createSessionStorage<string>({ type: 'local', sessionDir: tempDir })
    await storage.save({
      version: 1,
      id: 'storage-test',
      entries: [],
      metadata: { createdAt: 0, lastActiveAt: 0, messageCount: 0, compactionCount: 0, tags: [] },
    })

    const ids = await storage.list()
    expect(ids).toContain('storage-test')
  })

  it('#then throws for unknown storage type', () => {
    expect(() => createSessionStorage({ type: 'unknown' as any, sessionDir: '/' })).toThrow('Unsupported storage type')
  })
})

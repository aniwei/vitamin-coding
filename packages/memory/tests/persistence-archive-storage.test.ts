import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryPersistence } from '@vitamin/persistence'
import {
  PersistenceBackedArchiveStorage,
  createPersistenceArchiveStorage,
} from '../src/persistence-archive-storage'

import type { ArchiveRecord } from '../src/persistence-archive-storage'
import type { Message } from '@vitamin/ai'

function makeMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, i) => ({
    role: 'user' as const,
    content: [{ type: 'text' as const, text: `message-${i}` }],
    timestamp: Date.now(),
  }))
}

describe('PersistenceBackedArchiveStorage', () => {
  let persistence: MemoryPersistence<ArchiveRecord>
  let storage: PersistenceBackedArchiveStorage

  beforeEach(() => {
    persistence = new MemoryPersistence<ArchiveRecord>()
    storage = new PersistenceBackedArchiveStorage(persistence, 'memory')
  })

  it('archives messages and returns a stable id', async () => {
    const messages = makeMessages(3)
    const path = await storage.archive('session-1', messages, 'test summary')

    expect(path).toContain('session-1')
    expect(path).toContain('compaction-')
  })

  it('reads back archived content', async () => {
    const messages = makeMessages(2)
    const path = await storage.archive('s1', messages, 'a summary')

    const content = await storage.read(path)
    expect(content).toContain('### Summary')
    expect(content).toContain('a summary')
    expect(content).toContain('message-0')
    expect(content).toContain('message-1')
  })

  it('throws when reading a non-existent archive', async () => {
    await expect(storage.read('non-existent-id')).rejects.toThrow('Archive not found')
  })

  it('lists archives filtered by sessionId', async () => {
    const messages = makeMessages(1)
    await storage.archive('s1', messages, 'summary-1')
    await new Promise(r => setTimeout(r, 2))
    await storage.archive('s2', messages, 'summary-2')
    await new Promise(r => setTimeout(r, 2))
    await storage.archive('s1', messages, 'summary-3')

    const s1Entries = await storage.list('s1')
    expect(s1Entries).toHaveLength(2)
    expect(s1Entries[0].summary).toContain('summary-')
    expect(s1Entries[1].summary).toContain('summary-')

    const s2Entries = await storage.list('s2')
    expect(s2Entries).toHaveLength(1)
  })

  it('returns empty array for unknown session', async () => {
    const entries = await storage.list('unknown')
    expect(entries).toEqual([])
  })

  it('entries are sorted by timestamp', async () => {
    const messages = makeMessages(1)
    const path1 = await storage.archive('s1', messages, 'first')
    // small delay to ensure different timestamps
    await new Promise(r => setTimeout(r, 5))
    const path2 = await storage.archive('s1', messages, 'second')

    const entries = await storage.list('s1')
    expect(entries).toHaveLength(2)
    expect(entries[0].path).toBe(path1)
    expect(entries[1].path).toBe(path2)
    expect(entries[0].timestamp).toBeLessThanOrEqual(entries[1].timestamp)
  })

  it('preserves messageCount in entries', async () => {
    const messages = makeMessages(7)
    await storage.archive('s1', messages, 'sum')

    const entries = await storage.list('s1')
    expect(entries[0].messageCount).toBe(7)
  })

  it('truncates summary to 200 chars in entry', async () => {
    const messages = makeMessages(1)
    const longSummary = 'x'.repeat(300)
    await storage.archive('s1', messages, longSummary)

    const entries = await storage.list('s1')
    expect(entries[0].summary.length).toBe(200)
  })

  it('type defaults to local when not specified', () => {
    const s = new PersistenceBackedArchiveStorage(persistence)
    expect(s.type).toBe('local')
  })
})

describe('createPersistenceArchiveStorage', () => {
  it('creates a memory-backed archive storage via factory', async () => {
    const storage = createPersistenceArchiveStorage({ type: 'memory' })

    expect(storage.type).toBe('memory')

    const path = await storage.archive('s1', makeMessages(2), 'factory-test')
    const content = await storage.read(path)
    expect(content).toContain('factory-test')

    const entries = await storage.list('s1')
    expect(entries).toHaveLength(1)
  })
})

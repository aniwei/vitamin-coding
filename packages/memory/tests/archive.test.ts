import { describe, expect, it } from 'vitest'
import { InMemoryArchiveStorage, formatArchive } from '../src/archive'

import type { Message } from '@x-mars/ai'

function userMsg(text: string): Message {
  return { role: 'user', content: [{ type: 'text', text }], timestamp: Date.now() }
}

function assistantMsg(text: string): Message {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
  } as unknown as Message
}

describe('InMemoryArchiveStorage', () => {
  it('#given archive call #then returns a path containing sessionId', async () => {
    const storage = new InMemoryArchiveStorage()
    const path = await storage.archive('s1', [userMsg('hi')], 'summary')

    expect(path).toContain('s1')
    expect(storage.type).toBe('memory')
  })

  it('#given archived content #then read returns it', async () => {
    const storage = new InMemoryArchiveStorage()
    const path = await storage.archive('s1', [userMsg('hello')], 'my summary')
    const content = await storage.read(path)

    expect(content).toContain('my summary')
    expect(content).toContain('hello')
  })

  it('#given non-existent path #then read throws', async () => {
    const storage = new InMemoryArchiveStorage()
    await expect(storage.read('missing')).rejects.toThrow('Archive not found')
  })

  it('#given multiple archives for different sessions #then list filters by sessionId', async () => {
    const storage = new InMemoryArchiveStorage()
    await storage.archive('s1', [userMsg('a')], 'sum-a')
    await storage.archive('s2', [userMsg('b')], 'sum-b')
    await storage.archive('s1', [userMsg('c')], 'sum-c')

    const s1Entries = await storage.list('s1')
    expect(s1Entries).toHaveLength(2)

    const s2Entries = await storage.list('s2')
    expect(s2Entries).toHaveLength(1)
  })

  it('#given unknown sessionId #then list returns empty', async () => {
    const storage = new InMemoryArchiveStorage()
    const entries = await storage.list('unknown')
    expect(entries).toEqual([])
  })
})

describe('formatArchive', () => {
  it('#given messages and summary #then formats as markdown', () => {
    const messages: Message[] = [userMsg('hello'), assistantMsg('world')]
    const result = formatArchive(messages, 'test summary', Date.now())

    expect(result).toContain('### Summary')
    expect(result).toContain('test summary')
    expect(result).toContain('Original Messages (2 messages)')
    expect(result).toContain('**Human**: hello')
    expect(result).toContain('**Assistant**: world')
  })

  it('#given long message content #then truncates to 2000 chars', () => {
    const longText = 'x'.repeat(3000)
    const messages: Message[] = [userMsg(longText)]
    const result = formatArchive(messages, 'sum', Date.now())

    expect(result).toContain('truncated')
    expect(result).toContain('3000 chars total')
  })

  it('#given a timestamp #then includes ISO date', () => {
    const ts = new Date('2025-01-15T10:30:00Z').getTime()
    const result = formatArchive([], 'sum', ts)

    expect(result).toContain('2025-01-15')
  })
})

// @vitamin/session 单元测试
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { InMemorySession } from '../src/in-memory-session'
import { InMemorySessionStore, createInMemorySessionStore } from '../src/store'
import { FileSessionPersistence, createFileSessionPersistence } from '../src/file-persistence'
import { SessionManager, createSessionManager } from '../src/session-manager'

// ═══ InMemorySession 测试 ═══

describe('InMemorySession', () => {
  describe('#given a new session', () => {
    it('#then has correct id and empty entries', () => {
      const session = new InMemorySession('test-1')
      expect(session.id).toBe('test-1')
      expect(session.entries()).toHaveLength(0)
      expect(session.messages()).toHaveLength(0)
    })

    it('#then metadata is initialized', () => {
      const session = new InMemorySession('test-2')
      const meta = session.metadata()
      expect(meta.createdAt).toBeGreaterThan(0)
      expect(meta.lastActiveAt).toBeGreaterThan(0)
      expect(meta.messageCount).toBe(0)
      expect(meta.compactionCount).toBe(0)
      expect(meta.tags).toEqual([])
    })
  })

  describe('#when appending messages', () => {
    it('#then entries and messages grow', () => {
      const session = new InMemorySession<string>('s1')
      session.append('hello')
      session.append('world')

      expect(session.entries()).toHaveLength(2)
      expect(session.messages()).toEqual(['hello', 'world'])
    })

    it('#then metadata.messageCount increments', () => {
      const session = new InMemorySession<string>('s1')
      session.append('a')
      session.append('b')
      expect(session.metadata().messageCount).toBe(2)
    })
  })

  describe('#when compacting', () => {
    it('#then buildContext returns summary + remaining messages', () => {
      const session = new InMemorySession<string>('s1')
      session.append('msg1')
      session.append('msg2')

      session.compact('Summary of msg1-2', 2)

      // msg3 added AFTER compaction
      session.append('msg3')

      const ctx = session.buildContext()
      expect(ctx.summary).toBe('Summary of msg1-2')
      expect(ctx.messages).toEqual(['msg3'])
    })

    it('#then metadata.compactionCount increments', () => {
      const session = new InMemorySession<string>('s1')
      session.append('a')
      session.compact('summary', 1)
      expect(session.metadata().compactionCount).toBe(1)
    })

    it('#then rejects invalid compactedCount', () => {
      const session = new InMemorySession<string>('s1')
      session.append('a')
      session.compact('summary', 0)
      expect(session.entries()).toHaveLength(1) // no compaction entry
      session.compact('summary', 5)
      expect(session.entries()).toHaveLength(1) // still no compaction
    })
  })

  describe('#when buildContext with no compaction', () => {
    it('#then returns all messages without summary', () => {
      const session = new InMemorySession<string>('s1')
      session.append('a')
      session.append('b')
      
      const ctx = session.buildContext()
      expect(ctx.summary).toBeUndefined()
      expect(ctx.messages).toEqual(['a', 'b'])
    })
  })

  describe('#when using setTitle/setTags/addTag', () => {
    it('#then metadata reflects changes', () => {
      const session = new InMemorySession<string>('s1')
      session.setTitle('My Chat')
      session.addTag('important')
      session.addTag('code')

      const meta = session.metadata()
      expect(meta.title).toBe('My Chat')
      expect(meta.tags).toEqual(['important', 'code'])
    })

    it('#then addTag is idempotent', () => {
      const session = new InMemorySession<string>('s1')
      session.addTag('test')
      session.addTag('test')
      expect(session.metadata().tags).toEqual(['test'])
    })
  })

  describe('#when exporting snapshot', () => {
    it('#then snapshot includes all data', () => {
      const session = new InMemorySession<string>('s1')
      session.append('hello')
      session.setTitle('Test')

      const snap = session.toSnapshot()
      expect(snap.entries).toHaveLength(1)
      expect(snap.metadata.title).toBe('Test')
      expect(snap.metadata.messageCount).toBe(1)
    })
  })

  describe('#when restoring from snapshot', () => {
    it('#then session state is fully recovered', () => {
      const original = new InMemorySession<string>('s1')
      original.append('msg1')
      original.append('msg2')
      original.compact('summary', 1)
      original.append('msg3')
      original.setTitle('Restored')

      const snap = original.toSnapshot()

      const restored = new InMemorySession<string>('s1')
      restored.restoreEntries(snap.entries, snap.metadata)

      expect(restored.messages()).toEqual(['msg1', 'msg2', 'msg3'])
      const ctx = restored.buildContext()
      expect(ctx.summary).toBe('summary')
      expect(ctx.messages).toEqual(['msg3'])
      expect(restored.metadata().title).toBe('Restored')
    })
  })

  describe('#when creating with parent info', () => {
    it('#then metadata records parentSessionId', () => {
      const session = new InMemorySession<string>('fork-1', 'parent-1', 5)
      const meta = session.metadata()
      expect(meta.parentSessionId).toBe('parent-1')
      expect(meta.forkPoint).toBe(5)
    })
  })
})

// ═══ InMemorySessionStore 测试 ═══

describe('InMemorySessionStore', () => {
  describe('#given a fresh store', () => {
    it('#then can create and retrieve sessions', () => {
      const store = new InMemorySessionStore<string>()
      const s1 = store.createSession('s1')
      const s2 = store.createSession('s2')

      expect(store.getSession('s1')).toBe(s1)
      expect(store.getSession('s2')).toBe(s2)
      expect(store.listSessions()).toHaveLength(2)
    })

    it('#then returns undefined for nonexistent session', () => {
      const store = new InMemorySessionStore()
      expect(store.getSession('nope')).toBeUndefined()
    })

    it('#then auto-generates id when not provided', () => {
      const store = new InMemorySessionStore()
      const session = store.createSession()
      expect(session.id).toBeTruthy()
      expect(session.id.length).toBeGreaterThan(0)
    })
  })

  describe('#when deleting sessions', () => {
    it('#then session is removed', () => {
      const store = new InMemorySessionStore()
      store.createSession('to-delete')
      expect(store.deleteSession('to-delete')).toBe(true)
      expect(store.getSession('to-delete')).toBeUndefined()
    })

    it('#then returns false for nonexistent', () => {
      const store = new InMemorySessionStore()
      expect(store.deleteSession('nope')).toBe(false)
    })
  })

  describe('#when forking sessions', () => {
    it('#then creates independent copy', () => {
      const store = new InMemorySessionStore<string>()
      const original = store.createSession('original')
      original.append('msg1')
      original.append('msg2')

      const forked = store.forkSession('original', 'forked')
      expect(forked).toBeDefined()

      // Fork has all original messages
      expect(forked!.messages()).toEqual(['msg1', 'msg2'])

      // Adding to original doesn't affect fork
      original.append('msg3')
      expect(forked!.messages()).toEqual(['msg1', 'msg2'])

      // Fork metadata records parent
      const meta = forked!.metadata()
      expect(meta.parentSessionId).toBe('original')
      expect(meta.tags).toContain('fork')
    })

    it('#then returns undefined for nonexistent source', () => {
      const store = new InMemorySessionStore()
      expect(store.forkSession('nope')).toBeUndefined()
    })
  })

  describe('#createInMemorySessionStore factory', () => {
    it('#then creates a functional store', () => {
      const store = createInMemorySessionStore<string>()
      const s = store.createSession('test')
      expect(s.id).toBe('test')
    })
  })
})

// ═══ FileSessionPersistence 测试 ═══

describe('FileSessionPersistence', () => {
  let tempDir: string
  let persistence: FileSessionPersistence<string>

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'vitamin-session-test-'))
    persistence = new FileSessionPersistence<string>({ directory: tempDir })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('#when saving and loading', () => {
    it('#then snapshot is persisted and recovered', async () => {
      await persistence.save({
        id: 'test-session',
        entries: [
          { type: 'message', message: 'hello', timestamp: 1000 },
          { type: 'message', message: 'world', timestamp: 2000 },
        ],
        metadata: {
          createdAt: 1000,
          lastActiveAt: 2000,
          messageCount: 2,
          compactionCount: 0,
          tags: ['test'],
        },
      })

      const loaded = await persistence.load('test-session')
      expect(loaded).not.toBeNull()
      expect(loaded!.id).toBe('test-session')
      expect(loaded!.entries).toHaveLength(2)
      expect(loaded!.metadata.tags).toEqual(['test'])
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
      await persistence.save({ id: 'a', entries: [], metadata: { createdAt: 0, lastActiveAt: 0, messageCount: 0, compactionCount: 0, tags: [] } })
      await persistence.save({ id: 'b', entries: [], metadata: { createdAt: 0, lastActiveAt: 0, messageCount: 0, compactionCount: 0, tags: [] } })

      const ids = await persistence.list()
      expect(ids).toContain('a')
      expect(ids).toContain('b')
      expect(ids).toHaveLength(2)
    })
  })

  describe('#when deleting', () => {
    it('#then removes the persisted session', async () => {
      await persistence.save({ id: 'del-me', entries: [], metadata: { createdAt: 0, lastActiveAt: 0, messageCount: 0, compactionCount: 0, tags: [] } })
      
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
    it('#then sanitizes the filename', async () => {
      await persistence.save({ id: '../evil', entries: [], metadata: { createdAt: 0, lastActiveAt: 0, messageCount: 0, compactionCount: 0, tags: [] } })
      // Should save to safe filename, not traverse
      const ids = await persistence.list()
      expect(ids).toHaveLength(1)
      expect(ids[0]).not.toContain('/')
    })
  })
})

// ═══ SessionManager 测试 ═══

describe('SessionManager', () => {
  describe('#given a manager with in-memory store', () => {
    it('#then can create and get sessions', async () => {
      const manager = createSessionManager<string>({
        store: createInMemorySessionStore<string>(),
      })

      const session = await manager.create('s1', 'Test Chat')
      expect(session.id).toBe('s1')

      const retrieved = manager.get('s1')
      expect(retrieved).toBe(session)

      manager.dispose()
    })

    it('#then list returns all sessions', async () => {
      const manager = createSessionManager<string>({
        store: createInMemorySessionStore<string>(),
      })

      await manager.create('a')
      await manager.create('b')
      expect(manager.list()).toHaveLength(2)

      manager.dispose()
    })

    it('#then delete removes session', async () => {
      const manager = createSessionManager<string>({
        store: createInMemorySessionStore<string>(),
      })

      await manager.create('d1')
      expect(await manager.delete('d1')).toBe(true)
      expect(manager.get('d1')).toBeUndefined()

      manager.dispose()
    })
  })

  describe('#when maxSessions is reached', () => {
    it('#then create throws', async () => {
      const manager = createSessionManager<string>({
        store: createInMemorySessionStore<string>(),
        maxSessions: 2,
      })

      await manager.create('s1')
      await manager.create('s2')
      await expect(manager.create('s3')).rejects.toThrow('Max sessions')

      manager.dispose()
    })
  })

  describe('#when filtering sessions', () => {
    it('#then filters by tags', async () => {
      const store = new InMemorySessionStore<string>()
      const manager = createSessionManager<string>({ store })

      const s1 = await manager.create('s1')
      const s2 = await manager.create('s2')
      ;(s1 as InMemorySession<string>).addTag('important')
      ;(s2 as InMemorySession<string>).addTag('draft')

      const important = manager.filter({ tags: ['important'] })
      expect(important).toHaveLength(1)
      expect(important[0].id).toBe('s1')

      manager.dispose()
    })

    it('#then filters by hasParent', async () => {
      const store = new InMemorySessionStore<string>()
      const manager = createSessionManager<string>({ store })

      await manager.create('parent')
      ;(store.getSession('parent') as InMemorySession<string>).append('data')
      store.forkSession('parent', 'child')

      const forks = manager.filter({ hasParent: true })
      expect(forks).toHaveLength(1)
      expect(forks[0].id).toBe('child')

      manager.dispose()
    })
  })

  describe('#when forking sessions', () => {
    it('#then creates independent fork', async () => {
      const store = new InMemorySessionStore<string>()
      const manager = createSessionManager<string>({ store })

      const source = await manager.create('source')
      source.append('msg1')
      source.append('msg2')

      const forked = manager.fork('source', 'forked')
      expect(forked).toBeDefined()
      expect(forked!.messages()).toEqual(['msg1', 'msg2'])

      // Independence: new messages on source don't appear in fork
      source.append('msg3')
      expect(forked!.messages()).toEqual(['msg1', 'msg2'])

      manager.dispose()
    })
  })

  describe('#when collecting idle sessions', () => {
    it('#then removes sessions older than timeout', async () => {
      const store = new InMemorySessionStore<string>()
      const manager = createSessionManager<string>({
        store,
        idleTimeoutMs: 50, // 50ms for testing
      })

      const s = await manager.create('old')
      // Manually age the session
      const meta = s.metadata()
      ;(s as InMemorySession<string>).restoreEntries(
        [...(s as InMemorySession<string>).toSnapshot().entries],
        { ...meta, lastActiveAt: Date.now() - 100 },
      )

      const removed = manager.collectIdle()
      expect(removed).toContain('old')
      expect(manager.get('old')).toBeUndefined()

      manager.dispose()
    })
  })

  describe('#when using persistence', () => {
    let tempDir: string

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'vitamin-session-mgr-'))
    })

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true })
    })

    it('#then save + restoreAll round-trips', async () => {
      const persistence = createFileSessionPersistence<string>({ directory: tempDir })
      const store1 = new InMemorySessionStore<string>()
      const mgr1 = createSessionManager<string>({ store: store1, persistence })

      const s = await mgr1.create('persistent')
      s.append('hello')
      s.append('world')
      ;(s as InMemorySession<string>).setTitle('Saved Chat')

      await mgr1.saveAll()
      mgr1.dispose()

      // New manager + store, restore from disk
      const store2 = new InMemorySessionStore<string>()
      const mgr2 = createSessionManager<string>({ store: store2, persistence })

      const restored = await mgr2.restoreAll()
      expect(restored).toBe(1)

      const session = mgr2.get('persistent')
      expect(session).toBeDefined()
      expect(session!.messages()).toEqual(['hello', 'world'])
      expect(session!.metadata().title).toBe('Saved Chat')

      mgr2.dispose()
    })
  })
})

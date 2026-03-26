import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InMemorySession } from '../src/in-memory-session'
import { InMemorySessionStore, createInMemorySessionStore } from '../src/store'
import { createFileSessionPersistence } from '../src/file-persistence'
import { SessionManager, createSessionManager } from '../src/session-manager'

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

    it('#then filters by createdAfter', async () => {
      const mgr = SessionManager.inMemory<string>()
      const before = Date.now()
      await new Promise(r => setTimeout(r, 10))
      await mgr.create('later')

      const result = mgr.filter({ createdAfter: before })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('later')
      mgr.dispose()
    })

    it('#then filters by createdBefore', async () => {
      const mgr = SessionManager.inMemory<string>()
      await mgr.create('earlier')
      await new Promise(r => setTimeout(r, 10))
      const cutoff = Date.now()
      await new Promise(r => setTimeout(r, 10))
      await mgr.create('later')

      const result = mgr.filter({ createdBefore: cutoff })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('earlier')
      mgr.dispose()
    })

    it('#then filters by titleContains', async () => {
      const mgr = SessionManager.inMemory<string>({ maxSessions: 10 })
      const s1 = await mgr.create('s1', 'Debug HTTP issue')
      const s2 = await mgr.create('s2', 'Refactor database')
      const s3 = await mgr.create('s3') // no title

      const result = mgr.filter({ titleContains: 'HTTP' })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('s1')

      const noMatch = mgr.filter({ titleContains: 'nonexistent' })
      expect(noMatch).toHaveLength(0)

      mgr.dispose()
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

    it('#then fork returns undefined for nonexistent source', async () => {
      const mgr = SessionManager.inMemory<string>()
      expect(mgr.fork('nonexistent')).toBeUndefined()
      mgr.dispose()
    })
  })

  describe('#when create sets title', () => {
    it('#then session metadata has the title', async () => {
      const mgr = SessionManager.inMemory<string>()
      const s = await mgr.create('titled', 'My Title')
      expect(s.metadata().title).toBe('My Title')
      mgr.dispose()
    })

    it('#then create without title has no title', async () => {
      const mgr = SessionManager.inMemory<string>()
      const s = await mgr.create('untitled')
      expect(s.metadata().title).toBeUndefined()
      mgr.dispose()
    })
  })

  describe('#when using startGC / stopGC', () => {
    it('#then startGC auto-collects idle sessions', async () => {
      const mgr = SessionManager.inMemory<string>({ idleTimeoutMs: 20 })
      const s = await mgr.create('gc-target')
      // 手动老化
      ;(s as InMemorySession<string>).restoreEntries(
        [...(s as InMemorySession<string>).toSnapshot().entries],
        { ...s.metadata(), lastActiveAt: Date.now() - 100 },
      )

      mgr.startGC(30) // 每 30ms 运行 GC
      await new Promise(r => setTimeout(r, 80))
      expect(mgr.get('gc-target')).toBeUndefined()
      mgr.dispose() // stops GC
    })

    it('#then stopGC prevents further collections', async () => {
      const mgr = SessionManager.inMemory<string>({ idleTimeoutMs: 20 })
      await mgr.create('keep-me')
      mgr.startGC(30)
      mgr.stopGC()

      // 手动老化
      const s = mgr.get('keep-me')!
      ;(s as InMemorySession<string>).restoreEntries(
        [...(s as InMemorySession<string>).toSnapshot().entries],
        { ...s.metadata(), lastActiveAt: Date.now() - 100 },
      )

      await new Promise(r => setTimeout(r, 80))
      // GC 已停止，session 不应被清理
      expect(mgr.get('keep-me')).toBeDefined()
      mgr.dispose()
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

  describe('#when save/restore without persistence configured', () => {
    it('#then save is a silent no-op', async () => {
      const mgr = SessionManager.inMemory<string>()
      await mgr.create('no-persist')
      // 没有 persistence，不应抛异常
      await mgr.save('no-persist')
      await mgr.saveAll()
      mgr.dispose()
    })

    it('#then restoreAll returns 0', async () => {
      const mgr = SessionManager.inMemory<string>()
      const count = await mgr.restoreAll()
      expect(count).toBe(0)
      mgr.dispose()
    })

    it('#then restore returns null', async () => {
      const mgr = SessionManager.inMemory<string>()
      const result = await mgr.restore('anything')
      expect(result).toBeNull()
      mgr.dispose()
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

    it('#then save single session persists it', async () => {
      const persistence = createFileSessionPersistence<string>({ directory: tempDir })
      const mgr = createSessionManager<string>({
        store: new InMemorySessionStore<string>(),
        persistence,
      })

      const s = await mgr.create('single')
      s.append('only-me')

      await mgr.save('single')
      mgr.dispose()

      // 验证文件已写入
      const ids = await persistence.list()
      expect(ids).toContain('single')

      const loaded = await persistence.load('single')
      expect(loaded).not.toBeNull()
      expect(loaded!.entries).toHaveLength(1)
    })

    it('#then restore single session loads it into store', async () => {
      const persistence = createFileSessionPersistence<string>({ directory: tempDir })

      // 先保存
      const mgr1 = createSessionManager<string>({
        store: new InMemorySessionStore<string>(),
        persistence,
      })
      const s = await mgr1.create('restore-me')
      s.append('data')
      await mgr1.save('restore-me')
      mgr1.dispose()

      // 用新 manager 恢复单个 session
      const mgr2 = createSessionManager<string>({
        store: new InMemorySessionStore<string>(),
        persistence,
      })
      const restored = await mgr2.restore('restore-me')
      expect(restored).not.toBeNull()
      expect(restored!.messages()).toEqual(['data'])
      expect(mgr2.get('restore-me')).toBeDefined()
      mgr2.dispose()
    })

    it('#then restore returns null for nonexistent id', async () => {
      const persistence = createFileSessionPersistence<string>({ directory: tempDir })
      const mgr = createSessionManager<string>({
        store: new InMemorySessionStore<string>(),
        persistence,
      })
      const result = await mgr.restore('nope')
      expect(result).toBeNull()
      mgr.dispose()
    })

    it('#then restoreAll respects maxSessions limit', async () => {
      const persistence = createFileSessionPersistence<string>({ directory: tempDir })

      // 创建 5 个 session 并持久化
      const mgr1 = createSessionManager<string>({
        store: new InMemorySessionStore<string>(),
        persistence,
        maxSessions: 100,
      })
      for (let i = 0; i < 5; i++) {
        await mgr1.create(`s-${i}`)
      }
      await mgr1.saveAll()
      mgr1.dispose()

      // 用 maxSessions=3 的 manager 恢复
      const mgr2 = createSessionManager<string>({
        store: new InMemorySessionStore<string>(),
        persistence,
        maxSessions: 3,
      })
      const restored = await mgr2.restoreAll()
      expect(restored).toBe(3) // 最多恢复 3 个
      expect(mgr2.list()).toHaveLength(3)
      mgr2.dispose()
    })

    it('#then delete removes from both store and persistence', async () => {
      const persistence = createFileSessionPersistence<string>({ directory: tempDir })
      const mgr = createSessionManager<string>({
        store: new InMemorySessionStore<string>(),
        persistence,
      })

      await mgr.create('del-both')
      await mgr.save('del-both')

      // 验证已持久化
      expect(await persistence.list()).toContain('del-both')

      // 删除
      await mgr.delete('del-both')
      expect(mgr.get('del-both')).toBeUndefined()
      expect(await persistence.list()).not.toContain('del-both')

      mgr.dispose()
    })
  })
})

// ═══ 分页功能测试 ═══

describe('SessionManager#listPaginated', () => {
  it('#then paginates underlying store', async () => {
    const store = new InMemorySessionStore<string>()
    const manager = createSessionManager<string>({
      store,
      maxSessions: 200,
    })

    for (let i = 0; i < 60; i++) {
      await manager.create(`s-${i}`)
    }

    const page0 = manager.listPaginated({ page: 0 })
    expect(page0.total).toBe(60)
    expect(page0.items).toHaveLength(50)
    expect(page0.hasNext).toBe(true)

    const page1 = manager.listPaginated({ page: 1 })
    expect(page1.items).toHaveLength(10)
    expect(page1.hasNext).toBe(false)

    manager.dispose()
  })
})

describe('SessionManager#filterPaginated', () => {
  it('#then filters and paginates', async () => {
    const store = new InMemorySessionStore<string>()
    const manager = createSessionManager<string>({
      store,
      maxSessions: 200,
    })

    // 创建 30 个带 'important' 标签的 session
    for (let i = 0; i < 30; i++) {
      const s = await manager.create(`imp-${i}`)
      ;(s as InMemorySession<string>).addTag('important')
    }
    // 创建 20 个普通 session
    for (let i = 0; i < 20; i++) {
      await manager.create(`normal-${i}`)
    }

    const page0 = manager.filterPaginated(
      { tags: ['important'] },
      { page: 0, pageSize: 10 },
    )
    expect(page0.total).toBe(30)
    expect(page0.items).toHaveLength(10)
    expect(page0.totalPages).toBe(3)
    expect(page0.hasNext).toBe(true)

    const page2 = manager.filterPaginated(
      { tags: ['important'] },
      { page: 2, pageSize: 10 },
    )
    expect(page2.items).toHaveLength(10)
    expect(page2.hasNext).toBe(false)

    manager.dispose()
  })
})

// ═══ 静态工厂测试 ═══

describe('SessionManager static factories', () => {
  describe('SessionManager.inMemory()', () => {
    it('#then creates functional in-memory manager', async () => {
      const mgr = SessionManager.inMemory<string>()
      const session = await mgr.create('test')
      session.append('hello')
      expect(mgr.get('test')!.messages()).toEqual(['hello'])
      mgr.dispose()
    })
  })

  describe('SessionManager.create()', () => {
    let tempDir: string

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'vitamin-sm-factory-'))
    })

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true })
    })

    it('#then creates manager with file persistence', async () => {
      const mgr = SessionManager.create<string>(tempDir)
      const session = await mgr.create('factory-test')
      session.append('persisted')

      await mgr.save('factory-test')
      mgr.dispose()

      // 新 manager 从同目录恢复
      const mgr2 = SessionManager.create<string>(tempDir)
      const restored = await mgr2.restore('factory-test')
      expect(restored).not.toBeNull()
      expect(restored!.messages()).toEqual(['persisted'])
      mgr2.dispose()
    })
  })
})

// ═══ 活跃会话 & 便捷方法测试 ═══

describe('SessionManager active session', () => {
  it('#then create sets active automatically', async () => {
    const mgr = SessionManager.inMemory<string>()
    const session = await mgr.create('active-test')
    expect(mgr.active).toBe(session)
    mgr.dispose()
  })

  it('#then setActive switches to existing session', async () => {
    const mgr = SessionManager.inMemory<string>()
    await mgr.create('s1')
    const s2 = await mgr.create('s2')
    expect(mgr.active).toBe(s2)

    const switched = mgr.setActive('s1')
    expect(switched).toBeDefined()
    expect(mgr.active!.id).toBe('s1')
    mgr.dispose()
  })

  it('#then setActive returns undefined for nonexistent', async () => {
    const mgr = SessionManager.inMemory<string>()
    expect(mgr.setActive('nope')).toBeUndefined()
    mgr.dispose()
  })

  it('#then appendMessage adds to active session', async () => {
    const mgr = SessionManager.inMemory<string>()
    await mgr.create('msg-test')
    mgr.appendMessage('hello')
    mgr.appendMessage('world')
    expect(mgr.active!.messages()).toEqual(['hello', 'world'])
    mgr.dispose()
  })

  it('#then buildSessionContext returns active context', async () => {
    const mgr = SessionManager.inMemory<string>()
    await mgr.create('ctx-test')
    mgr.appendMessage('a')
    mgr.appendMessage('b')
    const ctx = mgr.buildSessionContext()
    expect(ctx.messages).toEqual(['a', 'b'])
    expect(ctx.summary).toBeUndefined()
    mgr.dispose()
  })

  it('#then getEntries returns active branch entries', async () => {
    const mgr = SessionManager.inMemory<string>()
    await mgr.create('entries-test')
    mgr.appendMessage('x')
    mgr.appendMessage('y')

    const entries = mgr.getEntries()
    expect(entries).toHaveLength(2)
    expect(entries[0].type).toBe('message')
    expect(entries[1].type).toBe('message')
    mgr.dispose()
  })

  it('#then branchAt switches branch on active session', async () => {
    const mgr = SessionManager.inMemory<string>()
    await mgr.create('branch-test')
    mgr.appendMessage('base')
    mgr.appendMessage('a1')

    const baseId = mgr.getEntries()[0].id

    mgr.branchAt(baseId)
    mgr.appendMessage('b1')

    expect(mgr.buildSessionContext().messages).toEqual(['base', 'b1'])
    mgr.dispose()
  })

  it('#then throws when no active session', () => {
    const mgr = SessionManager.inMemory<string>()
    expect(() => mgr.appendMessage('fail')).toThrow('No active session')
    expect(() => mgr.buildSessionContext()).toThrow('No active session')
    expect(() => mgr.getEntries()).toThrow('No active session')
    expect(() => mgr.branchAt('id')).toThrow('No active session')
    mgr.dispose()
  })

  it('#then active is undefined before any session is created', () => {
    const mgr = SessionManager.inMemory<string>()
    expect(mgr.active).toBeUndefined()
    mgr.dispose()
  })

  it('#then deleting active session makes active undefined', async () => {
    const mgr = SessionManager.inMemory<string>()
    await mgr.create('will-delete')
    expect(mgr.active).toBeDefined()
    await mgr.delete('will-delete')
    // active still points to same id, but session is gone
    expect(mgr.active).toBeUndefined()
    mgr.dispose()
  })
})

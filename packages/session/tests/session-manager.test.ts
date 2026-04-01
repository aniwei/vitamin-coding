import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InMemorySession } from '../src/in-memory-session'
import { createDiskSessionPersistence } from '../src/disk-persistence'
import {
  SessionManager,
  createDiskSessionManager,
  createInMemorySessionManager,
  createRemoteSessionManager,
} from '../src/session-manager'
import { InMemorySessionStore, createInMemorySessionStore } from '../src/store'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function ageSession(session: InMemorySession<string>, ageMs: number): void {
  const snapshot = session.toSnapshot()
  session.restoreEntries(
    [...snapshot.entries],
    { ...session.metadata(), lastActiveAt: Date.now() - ageMs },
    snapshot.leafId,
  )
}

describe('SessionManager', () => {
  describe('#given an in-memory manager', () => {
    it('#then creates, gets, lists and deletes sessions', async () => {
      const manager = createInMemorySessionManager<string>()

      const session = await manager.create('s1', 'Test Chat')

      expect(session.id).toBe('s1')
      expect(session.metadata().title).toBe('Test Chat')
      expect(manager.active).toBe(session)
      expect(manager.get('s1')).toBe(session)
      expect(manager.list()).toHaveLength(1)
      expect(await manager.delete('s1')).toBe(true)
      expect(manager.get('s1')).toBeUndefined()
      expect(manager.active).toBeUndefined()

      manager.dispose()
    })

    it('#then rejects duplicate ids', async () => {
      const manager = createInMemorySessionManager<string>()

      await manager.create('s1')
      await expect(manager.create('s1')).rejects.toThrow('Session "s1" already exists.')

      manager.dispose()
    })

    it('#then rejects creation when maxSessions is exhausted', async () => {
      const manager = createInMemorySessionManager<string>({ maxSessions: 2 })

      await manager.create('first')
      await manager.create('second')

      await expect(manager.create('third')).rejects.toThrow('Max sessions (2) reached after idle collection.')

      manager.dispose()
    })
  })

  describe('#when using active session helpers', () => {
    it('#then setActive switches sessions and helper methods target the active branch', async () => {
      const manager = createInMemorySessionManager<string>()

      await manager.create('one')
      const second = await manager.create('two')
      expect(manager.active).toBe(second)

      expect(manager.setActive('one')?.id).toBe('one')
      expect(manager.setActive('missing')).toBeUndefined()
      expect(manager.active?.id).toBe('one')

      manager.appendMessage('base')
      manager.appendMessage('left')

      const baseId = manager.getEntries()[0]?.id
      expect(baseId).toBeTruthy()

      manager.branchAt(baseId as string)
      manager.appendMessage('right')

      expect(manager.buildSessionContext().messages).toEqual(['base', 'right'])
      expect(manager.getEntries()).toHaveLength(2)

      manager.dispose()
    })

    it('#then helper methods throw without an active session', () => {
      const manager = createInMemorySessionManager<string>()

      expect(() => manager.appendMessage('fail')).toThrow('No active session')
      expect(() => manager.buildSessionContext()).toThrow('No active session')
      expect(() => manager.getEntries()).toThrow('No active session')
      expect(() => manager.branchAt('entry')).toThrow('No active session')

      manager.dispose()
    })
  })

  describe('#when filtering sessions', () => {
    it('#then filters by tags, parent session, and title', async () => {
      const store = new InMemorySessionStore<string>()
      const manager = new SessionManager<string>({ store, maxSessions: 10 })

      const source = await manager.create('source', 'Debug HTTP issue') as InMemorySession<string>
      source.addTag('important')

      await manager.create('other', 'Refactor database')
      const child = await manager.fork('source', 'child') as InMemorySession<string>
      child.setTags(['fork'])
      child.setTitle('Branch notes')

      expect(manager.filter({ tags: ['important'] }).map((session: { id: string }) => session.id)).toEqual(['source'])
      expect(manager.filter({ hasParent: true }).map((session: { id: string }) => session.id)).toEqual(['child'])
      expect(manager.filter({ titleContains: 'HTTP' }).map((session: { id: string }) => session.id)).toEqual(['source'])

      manager.dispose()
    })

    it('#then filters by createdBefore and createdAfter', async () => {
      const manager = createInMemorySessionManager<string>({ maxSessions: 10 })

      await manager.create('earlier')
      await sleep(10)
      const cutoff = Date.now()
      await sleep(10)
      await manager.create('later')

      expect(manager.filter({ createdBefore: cutoff }).map((session) => session.id)).toEqual(['earlier'])
      expect(manager.filter({ createdAfter: cutoff }).map((session) => session.id)).toEqual(['later'])

      manager.dispose()
    })
  })

  describe('#when forking sessions', () => {
    it('#then creates an independent fork', async () => {
      const manager = new SessionManager<string>({
        store: new InMemorySessionStore<string>(),
      })

      const source = await manager.create('source')
      source.append('msg1')
      source.append('msg2')

      const forked = await manager.fork('source', 'forked')
      expect(forked?.messages()).toEqual(['msg1', 'msg2'])

      source.append('msg3')
      expect(forked?.messages()).toEqual(['msg1', 'msg2'])

      manager.dispose()
    })

    it('#then returns undefined for a missing source session', async () => {
      const manager = createInMemorySessionManager<string>()

      expect(await manager.fork('missing')).toBeUndefined()

      manager.dispose()
    })
  })

  describe('#when paginating sessions', () => {
    it('#then paginates the full list and filtered list', async () => {
      const manager = new SessionManager<string>({
        store: new InMemorySessionStore<string>(),
        maxSessions: 200,
      })

      for (let i = 0; i < 60; i++) {
        const session = await manager.create(`s-${i}`) as InMemorySession<string>
        if (i < 30) {
          session.addTag('important')
        }
      }

      const listPage0 = manager.listPaginated({ page: 0 })
      expect(listPage0.total).toBe(60)
      expect(listPage0.items).toHaveLength(50)
      expect(listPage0.hasNext).toBe(true)

      const listPage1 = manager.listPaginated({ page: 1 })
      expect(listPage1.items).toHaveLength(10)
      expect(listPage1.hasNext).toBe(false)

      const filteredPage0 = manager.filterPaginated({ tags: ['important'] }, { page: 0, pageSize: 10 })
      expect(filteredPage0.total).toBe(30)
      expect(filteredPage0.items).toHaveLength(10)
      expect(filteredPage0.totalPages).toBe(3)
      expect(filteredPage0.hasNext).toBe(true)

      const filteredPage2 = manager.filterPaginated({ tags: ['important'] }, { page: 2, pageSize: 10 })
      expect(filteredPage2.items).toHaveLength(10)
      expect(filteredPage2.hasNext).toBe(false)

      manager.dispose()
    })
  })

  describe('#when persistence is not configured', () => {
    it('#then save APIs are no-ops and restore APIs are empty', async () => {
      const manager = createInMemorySessionManager<string>()

      await manager.create('no-persist')
      await manager.save('no-persist')
      await manager.saveAll()

      expect(await manager.restore('missing')).toBeNull()
      expect(await manager.restoreAll()).toBe(0)

      manager.dispose()
    })
  })

  describe('#when collecting idle sessions', () => {
    it('#then collectIdle removes stale sessions', async () => {
      const manager = createInMemorySessionManager<string>({ idleTimeoutMs: 50 })
      const stale = await manager.create('stale') as InMemorySession<string>

      ageSession(stale, 100)

      expect(manager.collectIdle()).toContain('stale')
      expect(manager.get('stale')).toBeUndefined()

      manager.dispose()
    })

    it('#then startGC and stopGC remain compatibility no-ops', async () => {
      const manager = createInMemorySessionManager<string>({ idleTimeoutMs: 20 })
      const session = await manager.create('keep-me') as InMemorySession<string>

      ageSession(session, 100)
      manager.startGC(10)
      await sleep(40)

      expect(manager.get('keep-me')).toBeDefined()

      manager.stopGC()
      manager.dispose()
    })
  })

  describe('#when using disk persistence', () => {
    let tempDir: string

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'vitamin-session-mgr-'))
    })

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true })
    })

    it('#then save and restoreAll round-trip sessions', async () => {
      const persistence = createDiskSessionPersistence<string>({ baseDir: tempDir })
      const manager1 = new SessionManager<string>({
        store: new InMemorySessionStore<string>(),
        persistence,
      })

      const session = await manager1.create('persistent', 'Saved Chat')
      session.append('hello')
      session.append('world')
      await manager1.saveAll()
      manager1.dispose()

      const manager2 = new SessionManager<string>({
        store: new InMemorySessionStore<string>(),
        persistence,
      })

      expect(await manager2.restoreAll()).toBe(1)

      const restored = manager2.get('persistent')
      expect(restored?.messages()).toEqual(['hello', 'world'])
      expect(restored?.metadata().title).toBe('Saved Chat')

      manager2.dispose()
    })

    it('#then restoreAll respects maxSessions', async () => {
      const persistence = createDiskSessionPersistence<string>({ baseDir: tempDir })
      const writer = new SessionManager<string>({
        store: new InMemorySessionStore<string>(),
        persistence,
        maxSessions: 100,
      })

      for (let i = 0; i < 5; i++) {
        await writer.create(`s-${i}`)
      }

      await writer.saveAll()
      writer.dispose()

      const reader = new SessionManager<string>({
        store: new InMemorySessionStore<string>(),
        persistence,
        maxSessions: 3,
      })

      expect(await reader.restoreAll()).toBe(3)
      expect(reader.list()).toHaveLength(3)

      reader.dispose()
    })

    it('#then delete removes from store and persistence', async () => {
      const persistence = createDiskSessionPersistence<string>({ baseDir: tempDir })
      const manager = new SessionManager<string>({
        store: new InMemorySessionStore<string>(),
        persistence,
      })

      await manager.create('del-both')
      await manager.save('del-both')
      expect(await persistence.list()).toContain('del-both')

      await manager.delete('del-both')

      expect(manager.get('del-both')).toBeUndefined()
      expect(await persistence.list()).not.toContain('del-both')

      manager.dispose()
    })

    it('#then createDiskSessionManager provides a working factory', async () => {
      const writer = createDiskSessionManager<string>(tempDir)
      const session = await writer.create('factory-session')
      session.append('persisted')
      await writer.save('factory-session')
      writer.dispose()

      const reader = createDiskSessionManager<string>(tempDir)
      const restored = await reader.restore('factory-session')

      expect(restored?.messages()).toEqual(['persisted'])

      reader.dispose()
    })
  })

  describe('#when using factory helpers', () => {
    it('#then SessionManager accepts an explicit store', async () => {
      const manager = new SessionManager<string>({
        store: createInMemorySessionStore<string>(),
      })

      const session = await manager.create('explicit')
      expect(manager.get('explicit')).toBe(session)

      manager.dispose()
    })

    it('#then createRemoteSessionManager can manage in-memory sessions before persistence is used', async () => {
      const manager = createRemoteSessionManager<string>('https://api.test.dev/sessions')

      const session = await manager.create('remote-session')
      session.append('hello')

      expect(manager.get('remote-session')?.messages()).toEqual(['hello'])

      manager.dispose()
    })
  })
})

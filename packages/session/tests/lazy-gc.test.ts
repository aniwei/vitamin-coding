import { describe, expect, it } from 'vitest'
import { InMemorySession } from '../src/in-memory-session'
import { SessionManager } from '../src/session-manager'
import { createInMemorySessionStore } from '../src/store'
import type {
  PaginatedResult,
  PaginationOptions,
  SessionPersistence,
  SessionSnapshot,
} from '../src/types'

class InMemoryPersistence<T> implements SessionPersistence<T> {
  constructor(private readonly snapshots: Map<string, SessionSnapshot<T>>) {}

  async save(snapshot: SessionSnapshot<T>): Promise<void> {
    this.snapshots.set(snapshot.id, snapshot)
  }

  async load(id: string): Promise<SessionSnapshot<T> | null> {
    return this.snapshots.get(id) ?? null
  }

  async delete(id: string): Promise<boolean> {
    return this.snapshots.delete(id)
  }

  async list(): Promise<string[]> {
    return [...this.snapshots.keys()]
  }

  async listPaginated(options: PaginationOptions): Promise<PaginatedResult<string>> {
    const pageSize = options.pageSize ?? 50
    const ids = [...this.snapshots.keys()]
    const total = ids.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.max(0, Math.min(options.page, totalPages - 1))
    const start = safePage * pageSize

    return {
      items: ids.slice(start, start + pageSize),
      total,
      page: safePage,
      pageSize,
      totalPages,
      hasNext: safePage < totalPages - 1,
      hasPrevious: safePage > 0,
    }
  }
}

function ageSession(session: InMemorySession<string>, ageMs: number): void {
  const snapshot = session.toSnapshot()
  session.restoreEntries(
    [...snapshot.entries],
    { ...session.metadata(), lastActiveAt: Date.now() - ageMs },
    snapshot.leafId,
  )
}

describe('SessionManager lazy idle collection', () => {
  it('only triggers lazy collection after crossing threshold', async () => {
    const manager = new SessionManager<string>({
      store: createInMemorySessionStore<string>(),
      maxSessions: 5,
      idleTimeoutMs: 20,
      threshold: 2,
    })

    const first = await manager.create('first') as InMemorySession<string>
    ageSession(first, 100)

    await manager.create('second')
    expect(manager.get('first')).toBeDefined()

    await manager.create('third')
    expect(manager.get('first')).toBeUndefined()
    expect(manager.list().map((session: { id: string }) => session.id).sort()).toEqual(['second', 'third'])

    manager.dispose()
  })

  it('throws after lazy collection when capacity is still exhausted', async () => {
    const manager = new SessionManager<string>({
      store: createInMemorySessionStore<string>(),
      maxSessions: 2,
      idleTimeoutMs: 1_000,
      threshold: 1,
    })

    await manager.create('first')
    await manager.create('second')

    await expect(manager.create('third')).rejects.toThrow('Max sessions (2) reached after idle collection.')

    manager.dispose()
  })

  it('restoreAll respects existing sessions, lazy collection, and hard capacity', async () => {
    const now = Date.now()
    const persistence = new InMemoryPersistence<string>(new Map([
      ['remote-1', { version: 1, id: 'remote-1', entries: [], metadata: { createdAt: now, lastActiveAt: now, messageCount: 0, compactionCount: 0, tags: [] } }],
      ['remote-2', { version: 1, id: 'remote-2', entries: [], metadata: { createdAt: now, lastActiveAt: now, messageCount: 0, compactionCount: 0, tags: [] } }],
      ['remote-3', { version: 1, id: 'remote-3', entries: [], metadata: { createdAt: now, lastActiveAt: now, messageCount: 0, compactionCount: 0, tags: [] } }],
    ]))

    const manager = new SessionManager<string>({
      store: createInMemorySessionStore<string>(),
      persistence,
      maxSessions: 3,
      idleTimeoutMs: 20,
      threshold: 2,
    })

    const stale = await manager.create('stale') as InMemorySession<string>
    await manager.create('keep')
    ageSession(stale, 100)

    const restored = await manager.restoreAll()

    expect(restored).toBe(2)
    expect(manager.list().map((session: { id: string }) => session.id).sort()).toEqual(['keep', 'remote-1', 'remote-2'])

    manager.dispose()
  })
})

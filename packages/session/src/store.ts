import { InMemorySession } from './in-memory-session'
import type { PaginatedResult, PaginationOptions, Session, SessionStore } from './types'

const DEFAULT_PAGE_SIZE = 50

export class InMemorySessionStore<T = unknown> implements SessionStore<T> {
  private readonly sessions = new Map<string, InMemorySession<T>>()

  async createSession(id: string = crypto.randomUUID()): Promise<Session<T>> {
    const session = new InMemorySession<T>(id)
    this.sessions.set(id, session)
    return session
  }

  getSession(id: string): Session<T> | undefined {
    return this.sessions.get(id)
  }

  listSessions(): ReadonlyArray<Session<T>> {
    return Array.from(this.sessions.values())
  }

  listSessionsPaginated(options: PaginationOptions): PaginatedResult<Session<T>> {
    const { page, sortBy = 'lastActiveAt', order = 'desc' } = options
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE

    const all = Array.from(this.sessions.values()) as Session<T>[]

    // 排序
    all.sort((a, b) => {
      const metaA = a.metadata()
      const metaB = b.metadata()
      const valA = sortBy === 'createdAt' ? metaA.createdAt : metaA.lastActiveAt
      const valB = sortBy === 'createdAt' ? metaB.createdAt : metaB.lastActiveAt
      return order === 'asc' ? valA - valB : valB - valA
    })

    const total = all.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.max(0, Math.min(page, totalPages - 1))
    const start = safePage * pageSize
    const items = all.slice(start, start + pageSize)

    return {
      items,
      total,
      page: safePage,
      pageSize,
      totalPages,
      hasNext: safePage < totalPages - 1,
      hasPrevious: safePage > 0,
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.sessions.delete(id)
  }

  async forkSession(
    sourceId: string,
    newId: string = crypto.randomUUID(),
  ): Promise<Session<T> | undefined> {
    const source = this.sessions.get(sourceId)
    if (!source) {
      return undefined
    }

    const snapshot = source.toSnapshot()
    const forked = new InMemorySession<T>(newId, sourceId, snapshot.entries.length)

    // 复制所有源 entries 并恢复 leafId
    forked.restoreEntries(
      [...snapshot.entries],
      {
        ...snapshot.metadata,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        parentSessionId: sourceId,
        forkPoint: snapshot.entries.length,
        tags: [...snapshot.metadata.tags, 'fork'],
      },
      snapshot.leafId,
      snapshot.checkpoints,
      snapshot.sideEffects,
    )

    this.sessions.set(newId, forked)
    return forked
  }
}

export function createInMemorySessionStore<T = unknown>(): SessionStore<T> {
  return new InMemorySessionStore<T>()
}

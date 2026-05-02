import { InMemorySession } from './in-memory-session'
import { InMemorySessionStore } from './store'
import { FileSessionPersistence } from './file-persistence'
import { SESSION_MAX, SESSION_IDLE_TIMEOUT_MS, SESSION_SNAPSHOT_VERSION } from '@x-mars/env'
import { SessionError } from '@x-mars/shared'
import { RemoteSessionPersistence } from './remote-persistence'
import type {
  PaginatedResult,
  PaginationOptions,
  Session,
  SessionContext,
  SessionEntry,
  SessionFilter,
  SessionManagerOptions,
  SessionPersistence,
  SessionSnapshot,
  SessionStore,
} from './types'

export class SessionManager<T = unknown> {
  private readonly store: SessionStore<T>
  private readonly persistence: SessionPersistence<T> | null
  private readonly idleTimeoutMs: number
  private readonly maxSessions: number
  private readonly threshold: number
  private activeSessionId: string | undefined

  constructor(options: SessionManagerOptions<T>) {
    const { store, persistence, idleTimeoutMs, maxSessions } = options

    const resolvedMaxSessions = maxSessions ?? SESSION_MAX

    this.store = store
    this.persistence = persistence ?? null
    this.idleTimeoutMs = idleTimeoutMs ?? SESSION_IDLE_TIMEOUT_MS
    this.maxSessions = resolvedMaxSessions
    this.threshold = Math.max(
      0,
      Math.min(options.threshold ?? resolvedMaxSessions, resolvedMaxSessions),
    )
  }

  get active(): Session<T> | undefined {
    return this.activeSessionId ? this.store.getSession(this.activeSessionId) : undefined
  }

  // 设置活跃会话
  setActive(id: string): Session<T> | undefined {
    const session = this.store.getSession(id)
    if (session) {
      this.activeSessionId = id
    }
    return session
  }

  appendMessage(message: T): void {
    const session = this.requireActive()
    session.append(message)
  }

  buildSessionContext(): SessionContext<T> {
    return this.requireActive().buildContext()
  }

  getEntries(): ReadonlyArray<SessionEntry<T>> {
    return this.requireActive().branchEntries()
  }

  branchAt(entryId: string): void {
    this.requireActive().branch(entryId)
  }

  private requireActive(): Session<T> {
    const session = this.active

    if (!session) {
      throw new SessionError('No active session. Call setActive(id) or create() first.', {
        code: 'SESSION_ACTIVE_REQUIRED',
        metadata: { operation: 'requireActive' },
      })
    }

    return session
  }

  async create(id?: string, title?: string): Promise<Session<T>> {
    this.prepareForNewSession(id)

    const session = await this.store.createSession(id)

    if (title && session instanceof InMemorySession) {
      session.setTitle(title)
    }

    this.activeSessionId = session.id
    return session
  }

  get(id: string): Session<T> | undefined {
    return this.store.getSession(id)
  }

  list(): ReadonlyArray<Session<T>> {
    return this.store.listSessions()
  }

  listPaginated(options: PaginationOptions): PaginatedResult<Session<T>> {
    return this.store.listSessionsPaginated(options)
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.store.deleteSession(id)

    if (deleted && this.activeSessionId === id) {
      this.activeSessionId = undefined
    }

    if (deleted && this.persistence) {
      await this.persistence.delete(id)
    }

    return deleted
  }

  filter(criteria: SessionFilter): Session<T>[] {
    const all = this.store.listSessions()

    return all.filter((session) => {
      const meta = session.metadata()

      // 标签过滤：要求 session 包含 criteria 中的所有标签
      if (criteria.tags && criteria.tags.length > 0) {
        if (!criteria.tags.every((t) => meta.tags.includes(t))) {
          return false
        }
      }

      // 其他元数据过滤
      if (criteria.createdAfter !== undefined && meta.createdAt < criteria.createdAfter) {
        return false
      }
      if (criteria.createdBefore !== undefined && meta.createdAt > criteria.createdBefore) {
        return false
      }
      if (criteria.hasParent !== undefined) {
        const hasParent = meta.parentSessionId !== undefined
        if (criteria.hasParent !== hasParent) {
          return false
        }
      }

      if (criteria.titleContains && (!meta.title || !meta.title.includes(criteria.titleContains))) {
        return false
      }

      return true
    })
  }

  // 按条件过滤 + 分页
  filterPaginated(
    criteria: SessionFilter,
    options: PaginationOptions,
  ): PaginatedResult<Session<T>> {
    const { page, sortBy = 'lastActiveAt', order = 'desc' } = options
    const pageSize = options.pageSize ?? 50

    const filtered = this.filter(criteria)

    // 排序
    filtered.sort((a, b) => {
      const metaA = a.metadata()
      const metaB = b.metadata()
      const valA = sortBy === 'createdAt' ? metaA.createdAt : metaA.lastActiveAt
      const valB = sortBy === 'createdAt' ? metaB.createdAt : metaB.lastActiveAt
      return order === 'asc' ? valA - valB : valB - valA
    })

    const total = filtered.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.max(0, Math.min(page, totalPages - 1))
    const start = safePage * pageSize
    const items = filtered.slice(start, start + pageSize)

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

  async fork(sourceId: string, newId?: string): Promise<Session<T> | undefined> {
    const source = this.store.getSession(sourceId)
    if (!source) {
      return undefined
    }

    this.prepareForNewSession(newId)

    const store = this.store

    if (store instanceof InMemorySessionStore) {
      return store.forkSession(sourceId, newId)
    }

    return this.genericFork(source, newId)
  }

  private async genericFork(
    source: Session<T>,
    newId: string = crypto.randomUUID() as string,
  ): Promise<Session<T> | undefined> {
    const target = await this.store.createSession(newId)
    const context = source.buildContext()

    for (const msg of context.messages) {
      target.append(msg)
    }

    return target
  }

  async save(id: string): Promise<void> {
    if (!this.persistence) {
      return
    }
    const session = this.store.getSession(id)

    if (!session) {
      return
    }

    if (session instanceof InMemorySession) {
      const snapshot = session.toSnapshot()
      await this.persistence.save({
        version: SESSION_SNAPSHOT_VERSION,
        id: session.id,
        ...snapshot,
      })
    }
  }

  async restore(id: string): Promise<Session<T> | null> {
    if (!this.persistence) {
      return null
    }

    const snapshot = await this.persistence.load(id)
    if (!snapshot) {
      return null
    }

    this.ensureCapacity(this.requiredCapacityFor(snapshot.id))
    return this.restoreWithSnapshot(snapshot)
  }

  async saveAll(): Promise<void> {
    if (!this.persistence) {
      return
    }

    for (const session of this.store.listSessions()) {
      await this.save(session.id)
    }
  }

  async restoreAll(): Promise<number> {
    if (!this.persistence) {
      return 0
    }

    const ids = await this.persistence.list()

    let restored = 0
    for (const id of ids) {
      const snapshot = await this.persistence.load(id)
      if (!snapshot) {
        continue
      }

      const requiredCapacity = this.requiredCapacityFor(snapshot.id)
      if (!this.canAccommodate(requiredCapacity)) {
        break
      }

      await this.restoreWithSnapshot(snapshot)
      if (requiredCapacity > 0) {
        restored++
      }
    }

    return restored
  }

  // 手动回收空闲会话
  collectIdle(): string[] {
    const now = Date.now()
    const removed: string[] = []

    for (const session of this.store.listSessions()) {
      const meta = session.metadata()
      if (now - meta.lastActiveAt > this.idleTimeoutMs) {
        this.store.deleteSession(session.id)
        if (this.activeSessionId === session.id) {
          this.activeSessionId = undefined
        }
        removed.push(session.id)
      }
    }

    return removed
  }

  // 清理资源
  dispose(): void {}

  private prepareForNewSession(id?: string): void {
    this.collectIdleIfNeeded(1)
    this.assertSessionIdAvailable(id)

    if (!this.hasCapacity(1)) {
      throw new SessionError(`Max sessions (${this.maxSessions}) reached after idle collection.`, {
        code: 'SESSION_CAPACITY_EXCEEDED',
        retryable: true,
        metadata: {
          maxSessions: this.maxSessions,
          currentSessions: this.sessionCount(),
          requiredCapacity: 1,
        },
      })
    }
  }

  private ensureCapacity(requiredCapacity: number): void {
    this.collectIdleIfNeeded(requiredCapacity)

    if (!this.hasCapacity(requiredCapacity)) {
      throw new SessionError(`Max sessions (${this.maxSessions}) reached after idle collection.`, {
        code: 'SESSION_CAPACITY_EXCEEDED',
        retryable: true,
        metadata: {
          maxSessions: this.maxSessions,
          currentSessions: this.sessionCount(),
          requiredCapacity,
        },
      })
    }
  }

  private canAccommodate(requiredCapacity: number): boolean {
    this.collectIdleIfNeeded(requiredCapacity)
    return this.hasCapacity(requiredCapacity)
  }

  private hasCapacity(requiredCapacity: number): boolean {
    return this.sessionCount() + requiredCapacity <= this.maxSessions
  }

  private collectIdleIfNeeded(requiredCapacity: number): string[] {
    if (requiredCapacity <= 0) {
      return []
    }

    if (this.sessionCount() + requiredCapacity <= this.threshold) {
      return []
    }

    return this.collectIdle()
  }

  private requiredCapacityFor(id: string): number {
    return this.store.getSession(id) ? 0 : 1
  }

  private assertSessionIdAvailable(id?: string): void {
    if (id && this.store.getSession(id)) {
      throw new SessionError(`Session "${id}" already exists.`, {
        code: 'SESSION_ALREADY_EXISTS',
        metadata: { sessionId: id },
      })
    }
  }

  private async restoreWithSnapshot(snapshot: SessionSnapshot<T>): Promise<Session<T>> {
    const session = (await this.store.createSession(snapshot.id)) as InMemorySession<T>
    if (session instanceof InMemorySession) {
      session.restoreEntries(
        snapshot.entries,
        snapshot.metadata,
        snapshot.leafId,
        snapshot.checkpoints,
        snapshot.sideEffects,
      )
    }

    return session
  }

  private sessionCount(): number {
    return this.store.listSessions().length
  }
}

export interface CreateSessionManagerOptions<T> extends Partial<
  Omit<SessionManagerOptions<T>, 'store' | 'persistence'>
> {}

export function createInMemorySessionManager<T = unknown>(
  options?: CreateSessionManagerOptions<T>,
): SessionManager<T> {
  const store = new InMemorySessionStore<T>()
  return new SessionManager<T>({
    store,
    ...options,
  })
}

export function createDiskSessionManager<T = unknown>(
  sessionDir: string,
  options?: CreateSessionManagerOptions<T>,
): SessionManager<T> {
  const store = new InMemorySessionStore<T>()
  const persistence = new FileSessionPersistence<T>({ baseDir: sessionDir })

  return new SessionManager<T>({
    store,
    persistence,
    ...options,
  })
}

export function createRemoteSessionManager<T = unknown>(
  endpoint: string,
  options?: CreateSessionManagerOptions<T>,
): SessionManager<T> {
  const store = new InMemorySessionStore<T>()
  const persistence = new RemoteSessionPersistence<T>({
    baseUrl: endpoint,
    fetch() {
      throw new SessionError('Fetch implementation is required for RemoteSessionPersistence', {
        code: 'SESSION_REMOTE_FETCH_REQUIRED',
        metadata: { endpoint },
      })
    },
    getAuth: async () => ({ token: '' }),
    timeoutMs: 30_000,
  })

  return new SessionManager<T>({
    store,
    persistence,
    ...options,
  })
}

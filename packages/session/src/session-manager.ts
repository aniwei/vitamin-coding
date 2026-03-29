import { InMemorySession } from './in-memory-session'
import { InMemorySessionStore } from './store'
import { FileSessionPersistence } from './file-persistence'
import { 
  SESSION_MAX,
  SESSION_IDLE_TIMEOUT_MS, 
  SESSION_SNAPSHOT_VERSION,
} from '@vitamin/env'
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
  SessionStore,
} from './types'



export class SessionManager<T = unknown> {
  private readonly store: SessionStore<T>
  private readonly persistence: SessionPersistence<T> | null
  private readonly idleTimeoutMs: number
  private readonly maxSessions: number
  private gcTimer: ReturnType<typeof setInterval> | null = null
  private activeSessionId: string | undefined

  constructor(options: SessionManagerOptions<T>) {
    const { store, persistence, idleTimeoutMs, maxSessions } = options

    this.store = store
    this.persistence = persistence ?? null
    this.idleTimeoutMs = idleTimeoutMs ?? SESSION_IDLE_TIMEOUT_MS
    this.maxSessions = maxSessions ?? SESSION_MAX
  }


  // 设置活跃会话
  setActive(id: string): Session<T> | undefined {
    const session = this.store.getSession(id)
    if (session) {
      this.activeSessionId = id
    }
    return session
  }

  // 获取当前活跃会话 
  get active(): Session<T> | undefined {
    return this.activeSessionId
      ? this.store.getSession(this.activeSessionId)
      : undefined
  }

  // 向活跃会话追加消息
  appendMessage(message: T): void {
    const session = this.requireActive()
    session.append(message)
  }

  // 构建活跃会话 LLM 上下文
  buildSessionContext(): SessionContext<T> {
    return this.requireActive().buildContext()
  }

  // 获取活跃会话当前分支条目 
  getEntries(): ReadonlyArray<SessionEntry<T>> {
    return this.requireActive().branchEntries()
  }

  // 在活跃会话中切换分支
  branchAt(entryId: string): void {
    this.requireActive().branch(entryId)
  }

  private requireActive(): Session<T> {
    const session = this.active

    if (!session) {
      throw new Error('No active session. Call setActive(id) or create() first.')
    }

    return session
  }

  // 创建新会话（并设为活跃）
  async create(
    id?: string, 
    title?: string
  ): Promise<Session<T>> {
    // 检查容量
    const sessions = this.store.listSessions()
    if (sessions.length >= this.maxSessions) {
      throw new Error(`Max sessions (${this.maxSessions}) reached. Remove idle sessions first.`)
    }

    const session = this.store.createSession(id)

    if (title && session instanceof InMemorySession) {
      session.setTitle(title)
    }

    this.activeSessionId = session.id
    return session
  }

  // 获取会话
  get(id: string): Session<T> | undefined {
    return this.store.getSession(id)
  }

  // 列出所有会话
  list(): ReadonlyArray<Session<T>> {
    return this.store.listSessions()
  }

  // 分页列出会话
  listPaginated(options: PaginationOptions): PaginatedResult<Session<T>> {
    return this.store.listSessionsPaginated(options)
  }

  // 删除会话
  async delete(id: string): Promise<boolean> {
    const deleted = this.store.deleteSession(id)

    if (deleted && this.persistence) {
      await this.persistence.delete(id)
    }

    return deleted
  }

  // 按条件过滤会话
  filter(criteria: SessionFilter): Session<T>[] {
    const all = this.store.listSessions()

    return all.filter((session) => {
      const meta = session.metadata()

      // 标签过滤：要求 session 包含 criteria 中的所有标签
      if (criteria.tags && criteria.tags.length > 0) {
        if (!criteria.tags.every((t) => meta.tags.includes(t))) return false
      }

      // 其他元数据过滤
      if (criteria.createdAfter !== undefined && meta.createdAt < criteria.createdAfter) return false
      if (criteria.createdBefore !== undefined && meta.createdAt > criteria.createdBefore) return false
      if (criteria.hasParent !== undefined) {
        const hasParent = meta.parentSessionId !== undefined
        if (criteria.hasParent !== hasParent) return false
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
    const { page, sortBy = 'lastActiveAt', sortOrder = 'desc' } = options
    const pageSize = options.pageSize ?? 50

    const filtered = this.filter(criteria)

    // 排序
    filtered.sort((a, b) => {
      const metaA = a.metadata()
      const metaB = b.metadata()
      const valA = sortBy === 'createdAt' ? metaA.createdAt : metaA.lastActiveAt
      const valB = sortBy === 'createdAt' ? metaB.createdAt : metaB.lastActiveAt
      return sortOrder === 'asc' ? valA - valB : valB - valA
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

  /// ── 分支
  // 从源 session fork 出独立副本
  fork(
    sourceId: string, 
    newId?: string
  ): Session<T> | undefined {
    const store = this.store

    if (store instanceof InMemorySessionStore) {
      return store.forkSession(sourceId, newId)
    }

    // 泛型 store 回退：通用 fork 通过复制 entries 实现
    return this.genericFork(sourceId, newId)
  }

  private genericFork(
    sourceId: string, 
    newId: string = crypto.randomUUID() as string
  ): Session<T> | undefined {
    const source = this.store.getSession(sourceId)
    if (!source) return undefined

    const target = this.store.createSession(newId)
    const ctx = source.buildContext()

    // 只复制 context 级别（摘要 + 活跃消息），不复制全量历史
    for (const msg of ctx.messages) {
      target.append(msg)
    }

    return target
  }

  // ── 持久化 ──
  // 持久化指定会话
  async save(id: string): Promise<void> {
    if (!this.persistence) return
    const session = this.store.getSession(id)
    if (!session) return

    if (session instanceof InMemorySession) {
      const snapshot = session.toSnapshot()
      await this.persistence.save({
        version: SESSION_SNAPSHOT_VERSION,
        id: session.id,
        ...snapshot,
      })
    }
  }

  // 从持久化存储恢复会话
  async restore(id: string): Promise<Session<T> | null> {
    if (!this.persistence) return null
    const snapshot = await this.persistence.load(id)
    if (!snapshot) return null

    const session = this.store.createSession(snapshot.id) as InMemorySession<T>
    if (session instanceof InMemorySession) {
      session.restoreEntries(snapshot.entries, snapshot.metadata, snapshot.leafId)
    }
    return session
  }

  // 持久化所有会话
  async saveAll(): Promise<void> {
    if (!this.persistence) return
    for (const session of this.store.listSessions()) {
      await this.save(session.id)
    }
  }

  // 从持久化存储恢复所有会话 
  async restoreAll(): Promise<number> {
    if (!this.persistence) return 0
    const ids = await this.persistence.list()
    let restored = 0
    for (const id of ids) {
      if (restored >= this.maxSessions) break
      const session = await this.restore(id)
      if (session) restored++
    }
    return restored
  }

  // ── GC (空闲回收) ──
  // 启动定期 GC
  startGC(intervalMs = 60_000): void {
    this.stopGC()
    this.gcTimer = setInterval(() => { this.collectIdle() }, intervalMs)
    // 允许进程退出
    if (this.gcTimer && typeof this.gcTimer === 'object' && 'unref' in this.gcTimer) {
      this.gcTimer.unref()
    }
  }

  // 停止 GC
  stopGC(): void {
    if (this.gcTimer !== null) {
      clearInterval(this.gcTimer)
      this.gcTimer = null
    }
  }

  // 手动回收空闲会话
  collectIdle(): string[] {
    const now = Date.now()
    const removed: string[] = []

    for (const session of this.store.listSessions()) {
      const meta = session.metadata()
      if (now - meta.lastActiveAt > this.idleTimeoutMs) {
        this.store.deleteSession(session.id)
        removed.push(session.id)
      }
    }

    return removed
  }

  // 清理资源 
  dispose(): void {
    this.stopGC()
  }
}

export function createInMemorySessionManager<T = unknown>(
  options?: Partial<Omit<SessionManagerOptions<T>, 'store' | 'persistence'>>
): SessionManager<T> {
  const store = new InMemorySessionStore<T>()
  return new SessionManager<T>({
    store,
    ...options,
  })
}

// 基于本地文件持久化创建 SessionManager
export function createFileSessionManager<T = unknown>(
  sessionDir: string,
  options?: Partial<Omit<SessionManagerOptions<T>, 'store' | 'persistence'>>,
): SessionManager<T> {
  const store = new InMemorySessionStore<T>()
  const persistence = new FileSessionPersistence<T>({ directory: sessionDir })
  return new SessionManager<T>({
    store,
    persistence,
    ...options,
  })
}

export function createRemoteSessionManager<T = unknown>(
  endpoint: string,
  options?: Partial<Omit<SessionManagerOptions<T>, 'store' | 'persistence'>>,
): SessionManager<T> {
  const store = new InMemorySessionStore<T>()
  const persistence = new RemoteSessionPersistence<T>({ 
    baseUrl: endpoint,
    getAuth: async () => ({ token: '' }),
  })
  
  return new SessionManager<T>({
    store,
    persistence,
    ...options,
  })
}

export function createSessionManager<T = unknown>(
  options: SessionManagerOptions<T>,
): SessionManager<T> {
  return new SessionManager<T>(options)
}

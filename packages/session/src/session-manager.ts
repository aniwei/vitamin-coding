// SessionManager — 会话生命周期管理：CRUD + 持久化 + 过期回收 + 查询
import { InMemorySession } from './in-memory-session'
import { InMemorySessionStore } from './store'
import type {
  Session,
  SessionFilter,
  SessionManagerOptions,
  SessionPersistence,
  SessionStore,
} from './types'

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 分钟
const DEFAULT_MAX_SESSIONS = 50

export class SessionManager<T = unknown> {
  private readonly store: SessionStore<T>
  private readonly persistence: SessionPersistence<T> | null
  private readonly idleTimeoutMs: number
  private readonly maxSessions: number
  private gcTimer: ReturnType<typeof setInterval> | null = null

  constructor(options: SessionManagerOptions<T>) {
    this.store = options.store
    this.persistence = options.persistence ?? null
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS
  }

  // ── 生命周期 ──

  /** 创建新会话 */
  async create(id?: string, title?: string): Promise<Session<T>> {
    // 检查容量
    const sessions = this.store.listSessions()
    if (sessions.length >= this.maxSessions) {
      throw new Error(`Max sessions (${this.maxSessions}) reached. Remove idle sessions first.`)
    }

    const session = this.store.createSession(id)

    if (title && session instanceof InMemorySession) {
      session.setTitle(title)
    }

    return session
  }

  /** 获取会话 */
  get(id: string): Session<T> | undefined {
    return this.store.getSession(id)
  }

  /** 列出所有会话 */
  list(): ReadonlyArray<Session<T>> {
    return this.store.listSessions()
  }

  /** 删除会话 */
  async delete(id: string): Promise<boolean> {
    const deleted = this.store.deleteSession(id)
    if (deleted && this.persistence) {
      await this.persistence.delete(id)
    }
    return deleted
  }

  /** 按条件过滤会话 */
  filter(criteria: SessionFilter): Session<T>[] {
    const all = this.store.listSessions()
    return all.filter((session) => {
      const meta = session.metadata()
      if (criteria.tags && criteria.tags.length > 0) {
        if (!criteria.tags.every((t) => meta.tags.includes(t))) return false
      }
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

  // ── 分支 (子 Agent 上下文隔离) ──

  /** 从源 session fork 出独立副本 */
  fork(sourceId: string, newId?: string): Session<T> | undefined {
    const store = this.store
    if (store instanceof InMemorySessionStore) {
      return store.forkSession(sourceId, newId)
    }
    // 泛型 store 回退：通用 fork 通过复制 entries 实现
    return this.genericFork(sourceId, newId)
  }

  private genericFork(sourceId: string, newId: string = crypto.randomUUID() as string): Session<T> | undefined {
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

  /** 持久化指定会话 */
  async save(id: string): Promise<void> {
    if (!this.persistence) return
    const session = this.store.getSession(id)
    if (!session) return

    if (session instanceof InMemorySession) {
      const snapshot = session.toSnapshot()
      await this.persistence.save({ id: session.id, ...snapshot })
    }
  }

  /** 从持久化存储恢复会话 */
  async restore(id: string): Promise<Session<T> | null> {
    if (!this.persistence) return null
    const snapshot = await this.persistence.load(id)
    if (!snapshot) return null

    const session = this.store.createSession(snapshot.id) as InMemorySession<T>
    if (session instanceof InMemorySession) {
      session.restoreEntries(snapshot.entries, snapshot.metadata)
    }
    return session
  }

  /** 持久化所有会话 */
  async saveAll(): Promise<void> {
    if (!this.persistence) return
    for (const session of this.store.listSessions()) {
      await this.save(session.id)
    }
  }

  /** 从持久化存储恢复所有会话 */
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

  /** 启动定期 GC */
  startGC(intervalMs = 60_000): void {
    this.stopGC()
    this.gcTimer = setInterval(() => { this.collectIdle() }, intervalMs)
    // 允许进程退出
    if (this.gcTimer && typeof this.gcTimer === 'object' && 'unref' in this.gcTimer) {
      this.gcTimer.unref()
    }
  }

  /** 停止 GC */
  stopGC(): void {
    if (this.gcTimer !== null) {
      clearInterval(this.gcTimer)
      this.gcTimer = null
    }
  }

  /** 手动回收空闲会话 */
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

  /** 清理资源 */
  dispose(): void {
    this.stopGC()
  }
}

export function createSessionManager<T = unknown>(
  options: SessionManagerOptions<T>,
): SessionManager<T> {
  return new SessionManager<T>(options)
}

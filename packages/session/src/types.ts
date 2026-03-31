// Session 条目 — 普通消息 或 压缩摘要
// 每个条目具有唯一 id 和可选 parentId，形成树状追踪结构
export type SessionEntry<T = unknown> =
  | { type: 'message'; id: string; parentId?: string; message: T; timestamp: number }
  | { type: 'compaction'; id: string; parentId?: string; summary: string; compactedCount: number; timestamp: number }

// buildContext() 的返回值
export interface SessionContext<T = unknown> {
  // 最近一次压缩的摘要（如果有）
  summary?: string
  // 压缩边界之后的消息
  messages: T[]
}

// Session 元数据
export interface SessionMetadata {
  createdAt: number
  lastActiveAt: number
  messageCount: number
  compactionCount: number
  // 分支来源（fork 时记录）
  parentSessionId?: string
  // 分支时父 session 的 entry 索引 
  forkPoint?: number
  // 自定义标签
  tags: string[]
  // 会话标题（可由用户或 LLM 设置）
  title?: string
}

export interface Session<T = unknown> {
  id: string
  // 当前分支叶节点 id
  readonly leafId: string | undefined
  // 追加消息（自动生成 entry id，parentId 指向当前 leafId）
  append(message: T): void
  // 执行压缩：将当前分支上前 compactedCount 条未压缩消息替换为摘要
  compact(summary: string, compactedCount: number): void
  // 获取所有条目（含所有分支，用于序列化）
  entries(): ReadonlyArray<SessionEntry<T>>
  // 获取当前分支上的条目（从 root 到 leaf）
  branchEntries(): ReadonlyArray<SessionEntry<T>>
  // 构建上下文：沿当前分支返回摘要 + 压缩边界之后的消息
  buildContext(): SessionContext<T>
  // 当前分支上所有未压缩的消息
  messages(): ReadonlyArray<T>
  // 元数据
  metadata(): SessionMetadata
  // 切换到指定条目所在的分支（设置 leafId）
  branch(entryId: string): void
}

export interface SessionStore<T = unknown> {
  createSession(id?: string): Session<T>
  getSession(id: string): Session<T> | undefined
  listSessions(): ReadonlyArray<Session<T>>
  deleteSession(id: string): boolean
  // 分页列出 sessions
  listSessionsPaginated(options: PaginationOptions): PaginatedResult<Session<T>>
}

/// 持久化存储
// 序列化后的 session 快照（用于持久化存储）
export interface SessionSnapshot<T = unknown> {
  version: number // 当前: 1
  id: string
  entries: SessionEntry<T>[]
  metadata: SessionMetadata
  leafId?: string
}

// 持久化后端 — 文件系统、数据库等实现此接口
export interface SessionPersistence<T = unknown> {
  save(snapshot: SessionSnapshot<T>): Promise<void>
  load(id: string): Promise<SessionSnapshot<T> | null>
  delete(id: string): Promise<boolean>
  list(): Promise<string[]>
  // 分页列出已持久化的 session id
  listPaginated(options: PaginationOptions): Promise<PaginatedResult<string>>
}

export interface SessionManagerOptions<T = unknown> {
  store: SessionStore<T>
  persistence?: SessionPersistence<T>
  // 空闲超时 ms (默认 30 分钟)
  idleTimeoutMs?: number
  // 最大并发 session 数 (默认 50)
  maxSessions?: number
}

export interface SessionFilter {
  tags?: string[]
  createdAfter?: number
  createdBefore?: number
  hasParent?: boolean
  titleContains?: string
}

export interface DiskStorageOptions {
  type: 'local'
  baseDir: string
} 

export interface RemoteStorageOptions {
  type: 'remote'
  baseUrl: string
  getAuth: () => Promise<{ token: string }>
  fetch: typeof fetch
  timeoutMs?: number
}

export type StorageOptions = DiskStorageOptions | RemoteStorageOptions

export interface PaginationOptions {
  page: number
  pageSize?: number
  sortBy?: 'lastActiveAt' | 'createdAt'
  order?: 'asc' | 'desc'
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
}

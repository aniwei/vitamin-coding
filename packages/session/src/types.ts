import type { PaginatedResult } from '@vitamin/persistence'

export type SessionEntry<T = unknown> =
  | { type: 'message'; id: string; parentId?: string; message: T; timestamp: number }
  | {
      type: 'compaction'
      id: string
      parentId?: string
      summary: string
      compactedCount: number
      timestamp: number
    }

export interface SessionContext<T = unknown> {
  summary?: string
  messages: T[]
}

// Session 元数据
export interface SessionMetadata {
  createdAt: number
  lastActiveAt: number
  messageCount: number
  compactionCount: number
  parentSessionId?: string
  forkPoint?: number
  tags: string[]
  title?: string
}

export interface Session<T = unknown> {
  id: string
  readonly leafId: string | undefined
  append(message: T): void
  compact(summary: string, compactedCount: number): void
  entries(): ReadonlyArray<SessionEntry<T>>
  branchEntries(): ReadonlyArray<SessionEntry<T>>
  buildContext(): SessionContext<T>
  messages(): ReadonlyArray<T>
  metadata(): SessionMetadata
  branch(entryId: string): void
}

export interface SessionStore<T = unknown> {
  createSession(id?: string): Promise<Session<T>>
  getSession(id: string): Session<T> | undefined
  listSessions(): ReadonlyArray<Session<T>>
  deleteSession(id: string): Promise<boolean>
  listSessionsPaginated(options: PaginationOptions): PaginatedResult<Session<T>>
}

export interface SessionSnapshot<T = unknown> {
  version: number // 当前: 1
  id: string
  entries: SessionEntry<T>[]
  metadata: SessionMetadata
  leafId?: string
}

export interface SessionPersistence<T = unknown> {
  save(snapshot: SessionSnapshot<T>): Promise<void>
  load(id: string): Promise<SessionSnapshot<T> | null>
  delete(id: string): Promise<boolean>
  list(): Promise<string[]>
  listPaginated(options: PaginationOptions): Promise<PaginatedResult<string>>
}

export interface SessionManagerOptions<T = unknown> {
  store: SessionStore<T>
  persistence?: SessionPersistence<T>
  idleTimeoutMs?: number
  maxSessions?: number
  threshold?: number
}

export interface SessionFilter {
  tags?: string[]
  createdAfter?: number
  createdBefore?: number
  hasParent?: boolean
  titleContains?: string
}

export interface FileStorageOptions {
  type: 'local' | 'file'
  baseDir: string
}

export interface RemoteStorageOptions {
  type: 'remote' | 'http'
  baseUrl: string
  getAuth: () => Promise<{ token: string }>
  getHeaders?: () => Promise<Record<string, string>>
  fetch: typeof globalThis.fetch
  timeoutMs?: number
}

export type StorageOptions = FileStorageOptions | RemoteStorageOptions

// Session-specific pagination: sortBy 包含 session 域的字段（lastActiveAt）
export interface PaginationOptions {
  page: number
  pageSize?: number
  order?: 'asc' | 'desc'
  sortBy?: 'lastActiveAt' | 'createdAt'
}

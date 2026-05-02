import type { PaginatedResult } from '@x-mars/persistence'
export type { PaginatedResult } from '@x-mars/persistence'

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

export interface SessionMetadata {
  createdAt: number
  lastActiveAt: number
  messageCount: number
  compactionCount: number
  parentSessionId?: string
  forkPoint?: number
  tags: string[]
  title?: string
  memoryExtraction?: {
    lastMessageCount: number
  }
}

export interface SessionSideEffect {
  id: string
  type: 'file' | 'network' | 'process' | 'unknown'
  action: string
  targets: string[]
  createdAt: number
  toolCallId?: string
  toolName?: string
  reversible?: boolean
  metadata?: Record<string, unknown>
}

export interface SessionCheckpoint<T = unknown> {
  id: string
  label?: string
  createdAt: number
  entryCount: number
  sideEffectCount: number
  leafId?: string
  entries: SessionEntry<T>[]
  sideEffects: SessionSideEffect[]
  metadata: SessionMetadata
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
  updateMetadata(patch: Partial<SessionMetadata>): void
  recordSideEffect(effect: Omit<SessionSideEffect, 'id' | 'createdAt'>): SessionSideEffect
  listSideEffects(): ReadonlyArray<SessionSideEffect>
  createCheckpoint(label?: string): SessionCheckpoint<T>
  listCheckpoints(): ReadonlyArray<SessionCheckpoint<T>>
  restoreCheckpoint(checkpointId: string): boolean
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
  checkpoints?: SessionCheckpoint<T>[]
  sideEffects?: SessionSideEffect[]
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

// sortBy 比 @x-mars/persistence 多了 lastActiveAt（session 域字段）
export interface PaginationOptions {
  page: number
  pageSize?: number
  order?: 'asc' | 'desc'
  sortBy?: 'lastActiveAt' | 'createdAt'
}

export interface Snapshot<T = unknown> {
  version: number
  id: string
  data: T
  metadata: Metadata
}

export interface Metadata {
  createdAt: number
  updatedAt: number
  tags: string[]
  [key: string]: unknown
}

export interface Codec<T = unknown> {
  encode(snapshot: T): string
  decode(payload: string): T
  contentType?: string
}

export interface Persistence<T = unknown> {
  save(snapshot: Snapshot<T>): Promise<void>
  load(id: string): Promise<Snapshot<T> | null>
  delete(id: string): Promise<boolean>
  list(): Promise<string[]>
  listPaginated(options: PaginationOptions): Promise<PaginatedResult<string>>
}

export interface PaginationOptions {
  page: number
  pageSize?: number
  sortBy?: 'createdAt' | 'updatedAt'
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

export interface FileStorageOptions<T = unknown> {
  type: 'file'
  baseDir: string
  extension?: string
  codec?: Codec<Snapshot<T>>
}

export interface HttpStorageOptions<T = unknown> {
  type: 'http'
  baseUrl: string
  getAuth: () => Promise<{ token: string }>
  getHeaders?: () => Promise<Record<string, string>>
  fetch: typeof globalThis.fetch
  timeoutMs?: number
  codec?: Codec<Snapshot<T>>
}

export interface MemoryStorageOptions {
  type: 'memory'
}

export type StorageOptions<T = unknown> =
  | FileStorageOptions<T>
  | HttpStorageOptions<T>
  | MemoryStorageOptions

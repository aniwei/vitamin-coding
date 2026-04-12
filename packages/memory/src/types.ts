import type { Message } from '@vitamin/ai'

export type ContextSize = ['tokens', number] | ['messages', number] | ['fraction', number]

export type StorageType = 'file' | 'http' | 'memory'
export interface MemorySource {
  path: string
  writable: boolean
}

// 知识存储后端
export interface MemoryStore {
  load(sources: MemorySource[]): Promise<Map<string, string>>
  write(path: string, content: string): Promise<void>
  watch?(sources: MemorySource[], onChange: (path: string) => void): () => void
}

export interface PruneConfig {
  trigger: ContextSize
  protect: ContextSize
  minimum: number
  protectedTools: string[]
  truncateTools: string[]
  truncateMaxLength: number
}

export interface PruneResult {
  messages: Message[]
  prunedCount: number
  tokensSaved: number
  changed: boolean
}

export interface CompactionConfig {
  enabled: boolean
  trigger: ContextSize
  keepRecent: ContextSize
  reserveTokens: number
  customInstructions?: string
}

export interface CutPoint {
  firstKeptIndex: number
  turnStartIndex: number
  isSplitTurn: boolean
}

export interface CompactionPreparation {
  messagesToSummarize: Message[]
  turnPrefixMessages: Message[]
  preservedMessages: Message[]
  isSplitTurn: boolean
  tokensBefore: number
  previousSummary?: string
  fileOps: { read: string[]; modified: string[] }
}

export interface CompactionResult {
  summary: string
  firstKeptIndex: number
  tokensBefore: number
  archivePath?: string
}

export interface ArchiveStorage {
  readonly type: StorageType
  archive(sessionId: string, messages: Message[], summary: string): Promise<string>
  read(archivePath: string): Promise<string>
  list(sessionId: string): Promise<ArchiveEntry[]>
}

export interface ArchiveEntry {
  path: string
  timestamp: number
  messageCount: number
  summary: string
}

export interface ContextTokenEstimate {
  total: number
  fromUsage: number
  fromEstimate: number
  lastUsageIndex: number
}

export interface MemoryManagerConfig {
  sources?: MemorySource[]
  memoryStore?: MemoryStore
  compaction?: Partial<CompactionConfig>
  prune?: Partial<PruneConfig>
  archiveStorage?: ArchiveStorage
  summarize: (
    prompt: string,
    options?: { maxTokens?: number; signal?: AbortSignal },
  ) => Promise<string>
  estimateTokens?: (text: string) => number
  model?: { contextWindow: number; maxOutput: number }
}

export interface MemoryDefaults {
  compaction: CompactionConfig
  prune: PruneConfig
}

export interface StorageProvider {
  readonly type: StorageType
  createArchiveStorage(): ArchiveStorage
}

export interface FileStorageOptions {
  type: 'file'
  baseDir?: string
}

export interface HttpStorageOptions {
  type: 'http'
  baseUrl: string
  getAuth: () => Promise<{ token: string }>
  timeoutMs?: number
  fetch?: typeof globalThis.fetch
}

export interface MemoryStorageOptions {
  type: 'memory'
}

export type StorageOptions = FileStorageOptions | HttpStorageOptions | MemoryStorageOptions

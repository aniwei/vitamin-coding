import type { Message } from '@x-mars/ai'

export type ContextSize = ['tokens', number] | ['messages', number] | ['fraction', number]

export type StorageType = 'file' | 'http' | 'memory'
export interface MemorySource {
  path: string
  writable: boolean
}

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

export interface MemoryEntryMeta {
  name: string
  description: string
  type: MemoryType
  scope?: 'user' | 'project' | 'team' | 'reference'
  team?: string
}

export interface MemoryEntry extends MemoryEntryMeta {
  content: string
  filename: string
}

export interface LayeredMemoryStoreOptions {
  baseDir: string
  indexFile?: string
}

export interface SemanticRetrievalConfig {
  enabled: boolean
  maxResults: number
  summarize: (
    prompt: string,
    options?: { maxTokens?: number; signal?: AbortSignal },
  ) => Promise<string>
}

export interface SemanticRetrievalOptions {
  maxResults?: number
  signal?: AbortSignal
  expectedNames?: string[]
}

export interface SemanticRetrievalQuality {
  requested: number
  returned: number
  expected: number
  relevant: number
  precision: number
  recall: number
  missing: string[]
  unexpected: string[]
}

export interface MemoryScopeFilter {
  scopes?: Array<NonNullable<MemoryEntryMeta['scope']>>
  team?: string
}

export interface MemoryConflict {
  name: string
  entries: MemoryEntry[]
  reason: 'duplicate-name' | 'same-description'
  suggested: MemoryEntry
}

export interface MemoryExtractionConfig {
  enabled: boolean
  triggerMessageCount: number
  summarize: (
    prompt: string,
    options?: { maxTokens?: number; signal?: AbortSignal },
  ) => Promise<string>
}

export interface MemoryExtractionResult {
  entries: MemoryEntry[]
  indexUpdated: boolean
}

export interface MemoryEntryStore {
  get(name: string): MemoryEntry | undefined
  list?(): Iterable<MemoryEntry>
  save(entry: MemoryEntry): void | Promise<void>
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

export interface SnipConfig {
  maxOutputChars: number
  keepHeadLines: number
  keepTailLines: number
}

export interface SnipResult {
  messages: Message[]
  snippedCount: number
  changed: boolean
}

export interface TimeBasedMicroConfig {
  ageThresholdMs: number
  minOutputTokens: number
}

export interface TimeBasedMicroResult {
  messages: Message[]
  foldedCount: number
  tokensSaved: number
  changed: boolean
}

export interface CachedMicroConfig {
  trigger: ContextSize
  windowFraction: number
  maxCacheEntries: number
  reserveTokens: number
}

export interface CachedMicroResult {
  messages: Message[]
  summary?: string
  cached: boolean
  changed: boolean
}

export type ContextBudgetAction = 'none' | 'snip' | 'prune' | 'micro-compact' | 'compact'

export interface ContextBudgetPlan {
  action: ContextBudgetAction
  shouldProcess: boolean
  shouldCompact: boolean
  tokenEstimate: ContextTokenEstimate
  contextWindow: number
  reservedOutputTokens: number
  availableInputTokens: number
  pruneTriggerTokens: number
  microTriggerTokens: number
  compactionTriggerTokens: number
  remainingInputTokens: number
  utilization: number
  trace: string[]
}

export interface CompactionConfig {
  enabled: boolean
  trigger: ContextSize
  keepRecent: ContextSize
  reserveTokens: number
  customInstructions?: string
}

export interface PartialCompactOptions {
  fromIndex?: number
  upToIndex?: number
  messageCount?: number
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
  snip?: Partial<SnipConfig>
  timeMicro?: Partial<TimeBasedMicroConfig>
  cachedMicro?: Partial<CachedMicroConfig>
  memoryExtraction?: Partial<Omit<MemoryExtractionConfig, 'summarize'>>
  memoryEntryStore?: MemoryEntryStore
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

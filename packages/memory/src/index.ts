export { MemoryManager, createMemoryManager } from './memory-manager'

export {
  PersistentMemory,
  FileSystemMemoryStore,
  InMemoryMemoryStore,
  DEFAULT_MEMORY_SOURCES,
} from './persistent-memory'

export { prune } from './prune'

export {
  findCutPoint,
  needsCompaction,
  isEligibleForManualCompact,
  prepareCompaction,
  compact,
} from './compaction'


export {
  InMemoryArchiveStorage,
  LocalArchiveStorage,
  HttpArchiveStorage,
  createArchiveStorage,
  formatArchive,
} from './archive'

export {
  PersistenceBackedArchiveStorage,
  createPersistenceArchiveStorage,
} from './persistence-archive-storage'
export type { ArchiveRecord } from './persistence-archive-storage'

export {
  computeMemoryDefaults,
  resolveContextSize,
  DEFAULT_COMPACTION_CONFIG,
  DEFAULT_PRUNE_CONFIG,
} from './defaults'

export {
  estimateTokens,
  estimateMessageTokens,
  estimateMessagesTokens,
  estimateContextTokens,
  getTokensFromUsage,
  messageToText,
} from './token-estimator'

export {
  SUMMARIZATION_PROMPT,
  UPDATE_SUMMARIZATION_PROMPT,
  TURN_PREFIX_SUMMARIZATION_PROMPT,
  buildSummarizationPrompt,
  buildTurnPrefixPrompt,
  buildMemoryInjection,
  buildArchiveReference,
} from './prompts'

export type {
  ContextSize,
  StorageType,
  MemorySource,
  MemoryStore,
  PruneConfig,
  PruneResult,
  CompactionConfig,
  CutPoint,
  CompactionPreparation,
  CompactionResult,
  ArchiveStorage,
  ArchiveEntry,
  ContextTokenEstimate,
  MemoryManagerConfig,
  MemoryDefaults,
  StorageProvider,
  StorageOptions,
  FileStorageOptions,
  HttpStorageOptions,
  MemoryStorageOptions,
} from './types'

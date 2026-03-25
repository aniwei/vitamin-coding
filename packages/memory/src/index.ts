// @vitamin/memory — 多层记忆管理系统

// ── MemoryManager（统一入口）──
export { MemoryManager, createMemoryManager } from './memory-manager'

// ── L1 Persistent Memory ──
export {
  PersistentMemory,
  FileSystemMemoryStore,
  InMemoryMemoryStore,
  DEFAULT_MEMORY_SOURCES,
} from './persistent-memory'

// ── L2 Prune ──
export { prune } from './prune'

// ── L2 Compaction ──
export {
  findCutPoint,
  needsCompaction,
  isEligibleForManualCompact,
  prepareCompaction,
  compact,
} from './compaction'

// ── L3 Archive ──
export {
  InMemoryArchiveStorage,
  LocalArchiveStorage,
  RemoteArchiveStorage,
  createArchiveStorage,
} from './archive'

// ── Defaults ──
export {
  computeMemoryDefaults,
  resolveContextSize,
  DEFAULT_COMPACTION_CONFIG,
  DEFAULT_PRUNE_CONFIG,
} from './defaults'

// ── Token 估算 ──
export {
  estimateTokens,
  estimateMessageTokens,
  estimateMessagesTokens,
  estimateContextTokens,
  getTokensFromUsage,
  messageToText,
} from './token-estimator'

// ── Prompts ──
export {
  SUMMARIZATION_PROMPT,
  UPDATE_SUMMARIZATION_PROMPT,
  TURN_PREFIX_SUMMARIZATION_PROMPT,
  buildSummarizationPrompt,
  buildTurnPrefixPrompt,
  buildMemoryInjection,
  buildArchiveReference,
} from './prompts'

// ── Types ──
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
  StorageConfig,
  LocalStorageConfig,
  RemoteStorageConfig,
  MemoryStorageConfig,
} from './types'

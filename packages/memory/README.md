# @vitamin/memory

## 模块定位
提供记忆管理、归档、压缩与持久化接口封装。

## 当前状态（基于源码）
- 包目录：`packages/memory`
- 源码文件数：13
- 测试文件数：9
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `archive.ts`
  - `compaction.ts`
  - `defaults.ts`
  - `file-state-snapshot.ts`
  - `index.ts`
  - `memory-manager.ts`
  - `operational-learning.ts`
  - `persistence-archive-storage.ts`
  - `persistent-memory.ts`
  - `prompts.ts`
  - `prune.ts`
  - `token-estimator.ts`
- `tests/`
  - `archive.test.ts`
  - `compaction.test.ts`
  - `defaults.test.ts`
  - `operational-learning.test.ts`
  - `persistence-archive-storage.test.ts`
  - `persistent-memory.test.ts`
  - `prompts.test.ts`
  - `prune.test.ts`
  - `token-estimator.test.ts`

## 公开导出
```ts
export { MemoryManager, createMemoryManager } from './memory-manager'
export { PersistentMemory, FileSystemMemoryStore, InMemoryMemoryStore, DEFAULT_MEMORY_SOURCES, } from './persistent-memory'
export { prune } from './prune'
export { findCutPoint, needsCompaction, isEligibleForManualCompact, prepareCompaction, compact, } from './compaction'
export { InMemoryArchiveStorage, LocalArchiveStorage, HttpArchiveStorage, createArchiveStorage, formatArchive, } from './archive'
export { PersistenceBackedArchiveStorage, createPersistenceArchiveStorage, } from './persistence-archive-storage'
export type { ArchiveRecord } from './persistence-archive-storage'
export { computeMemoryDefaults, resolveContextSize, DEFAULT_COMPACTION_CONFIG, DEFAULT_PRUNE_CONFIG, } from './defaults'
export { estimateTokens, estimateMessageTokens, estimateMessagesTokens, estimateContextTokens, getTokensFromUsage, messageToText, } from './token-estimator'
export { SUMMARIZATION_PROMPT, UPDATE_SUMMARIZATION_PROMPT, TURN_PREFIX_SUMMARIZATION_PROMPT, buildSummarizationPrompt, buildTurnPrefixPrompt, buildMemoryInjection, buildArchiveReference, } from './prompts'
export type { ContextSize, StorageType, MemorySource, MemoryStore, PruneConfig, PruneResult, CompactionConfig, CutPoint, CompactionPreparation, CompactionResult, ArchiveStorage, ArchiveEntry, ContextTokenEstimate, MemoryManagerConfig, MemoryDefaults, StorageProvider, StorageOptions, FileStorageOptions, HttpStorageOptions, MemoryStorageOptions, } from './types'
export { FileStateManager } from './file-state-snapshot'
export type { FileStateSnapshot, FileStateCapture } from './file-state-snapshot'
export { OperationalLearningStore } from './operational-learning'
export type { Lesson, LessonInput, LessonFilter, LearningStoreOptions } from './operational-learning'
```

## 开发命令
- `pnpm --filter @vitamin/memory build`
- `pnpm --filter @vitamin/memory typecheck:project`
- `pnpm --filter @vitamin/memory typecheck:file`
- `pnpm --filter @vitamin/memory typecheck`
- `pnpm --filter @vitamin/memory clean`

## 关联 Vitamin 包
- `@vitamin/ai`
- `@vitamin/env`
- `@vitamin/persistence`
- `@vitamin/shared`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07

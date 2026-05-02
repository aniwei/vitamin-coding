import { createLogger } from '@vitamin/shared'

import { PersistentMemory, FileSystemMemoryStore } from './persistent-memory'
import { prune } from './prune'
import { snip } from './snip'
import { timeMicroCompact, cachedMicroCompact, MicroCompactCache } from './micro-compact'
import {
  needsCompaction,
  isEligibleForManualCompact,
  prepareCompaction,
  preparePartialCompact,
  compact,
} from './compaction'
import { InMemoryArchiveStorage } from './archive'
import { planContextBudget } from './context-budget'
import { extractAndSave, extractMemories as extractMemoryEntries } from './memory-extraction'
import { estimateTokens as defaultEstimateTokens, estimateMessagesTokens } from './token-estimator'
import {
  computeMemoryDefaults,
  resolveContextSize,
  DEFAULT_COMPACTION_CONFIG,
  DEFAULT_PRUNE_CONFIG,
  DEFAULT_SNIP_CONFIG,
  DEFAULT_TIME_MICRO_CONFIG,
  DEFAULT_CACHED_MICRO_CONFIG,
} from './defaults'
import { buildArchiveReference } from './prompts'
import {
  collectRestorationState,
  buildRestorationMessage,
  mergeRestorationState,
  createEmptyRestorationState,
} from './state-restoration'

import type {
  MemoryManagerConfig,
  CompactionConfig,
  PruneConfig,
  SnipConfig,
  TimeBasedMicroConfig,
  CachedMicroConfig,
  MemoryExtractionConfig,
  MemoryExtractionResult,
  MemoryEntryStore,
  PruneResult,
  CompactionPreparation,
  CompactionResult,
  ContextBudgetPlan,
  PartialCompactOptions,
  ArchiveEntry,
  ArchiveStorage,
} from './types'
import type { Message } from '@vitamin/ai'
import type { RestorationState } from './state-restoration'

const logger = createLogger('@vitamin/memory')

export class MemoryManager {
  private readonly persistent: PersistentMemory
  private readonly archiveStorage: ArchiveStorage
  private readonly summarize: MemoryManagerConfig['summarize']
  private readonly estimateTokens: (text: string) => number
  private readonly contextWindow: number
  private readonly compactionConfig: CompactionConfig
  private readonly pruneConfig: PruneConfig
  private readonly snipConfig: SnipConfig
  private readonly timeMicroConfig: TimeBasedMicroConfig
  private readonly cachedMicroConfig: CachedMicroConfig
  private readonly memoryExtractionConfig: MemoryExtractionConfig
  private readonly memoryEntryStore: MemoryEntryStore | undefined
  private readonly microCache: MicroCompactCache
  private extractionCount = 0
  private previousSummary?: string
  private restorationState: RestorationState

  constructor(config: MemoryManagerConfig) {
    const defaults = config.model
      ? computeMemoryDefaults(config.model)
      : { compaction: DEFAULT_COMPACTION_CONFIG, prune: DEFAULT_PRUNE_CONFIG }

    this.compactionConfig = { ...defaults.compaction, ...config.compaction }
    this.pruneConfig = { ...defaults.prune, ...config.prune }
    this.snipConfig = { ...DEFAULT_SNIP_CONFIG, ...config.snip }
    this.timeMicroConfig = { ...DEFAULT_TIME_MICRO_CONFIG, ...config.timeMicro }
    this.cachedMicroConfig = { ...DEFAULT_CACHED_MICRO_CONFIG, ...config.cachedMicro }
    this.memoryExtractionConfig = {
      enabled: true,
      triggerMessageCount: 6,
      ...config.memoryExtraction,
      summarize: config.summarize,
    }
    this.memoryEntryStore = config.memoryEntryStore
    this.microCache = new MicroCompactCache(this.cachedMicroConfig.maxCacheEntries)
    this.contextWindow = config.model?.contextWindow ?? 200_000
    this.archiveStorage = config.archiveStorage ?? new InMemoryArchiveStorage()
    this.summarize = config.summarize
    this.estimateTokens = config.estimateTokens ?? defaultEstimateTokens

    // L1 Persistent Memory
    const store = config.memoryStore ?? new FileSystemMemoryStore()
    this.persistent = new PersistentMemory(store, config.sources)

    // Post-compaction state restoration
    this.restorationState = createEmptyRestorationState()
  }

  // 加载所有知识 sources 到内存
  async loadMemory(): Promise<void> {
    await this.persistent.load()
  }

  // 获取格式化的 memory 注入文本（用于 system prompt）
  getMemoryPrompt(): string {
    return this.persistent.getInjection()
  }

  // 重新加载知识 sources
  async reloadMemory(): Promise<void> {
    await this.persistent.reload()
  }

  // 获取原始记忆内容
  getMemories(): ReadonlyMap<string, string> {
    return this.persistent.getMemories()
  }

  async extractMemories(
    messages: readonly Message[],
    signal?: AbortSignal,
  ): Promise<MemoryExtractionResult> {
    this.extractionCount++

    if (this.memoryEntryStore) {
      return extractAndSave(messages, this.memoryEntryStore, this.memoryExtractionConfig, signal)
    }

    const entries = await extractMemoryEntries(messages, this.memoryExtractionConfig, signal)
    return { entries, indexUpdated: false }
  }

  resetExtractionCounter(): void {
    this.extractionCount = 0
  }

  getExtractionCount(): number {
    return this.extractionCount
  }

  getMemoryExtractionTriggerMessageCount(): number {
    return this.memoryExtractionConfig.triggerMessageCount
  }

  planContextBudget(messages: readonly Message[]): ContextBudgetPlan {
    return planContextBudget(messages, {
      contextWindow: this.contextWindow,
      reservedOutputTokens: this.compactionConfig.reserveTokens,
      compaction: this.compactionConfig,
      prune: this.pruneConfig,
      cachedMicro: this.cachedMicroConfig,
      snip: this.snipConfig,
      estimateTokens: this.estimateTokens,
    })
  }

  // 检查是否需要 prune
  needsPrune(messages: readonly Message[]): boolean {
    const currentTokens = estimateMessagesTokens(messages, this.estimateTokens)
    const triggerTokens = resolveContextSize(this.pruneConfig.trigger, this.contextWindow)
    return currentTokens >= triggerTokens
  }

  // 执行 prune（无 LLM 裁剪旧 tool call 输出）
  prune(messages: readonly Message[]): PruneResult {
    return prune(messages, this.contextWindow, this.pruneConfig, this.estimateTokens)
  }

  // 检查是否需要 compaction
  needsCompaction(messages: readonly Message[]): boolean {
    return needsCompaction(messages, this.contextWindow, this.compactionConfig, this.estimateTokens)
  }

  // 手动压缩资格评估
  isEligibleForManualCompact(messages: readonly Message[]): boolean {
    return isEligibleForManualCompact(
      messages,
      this.contextWindow,
      this.compactionConfig,
      this.estimateTokens,
    )
  }

  // 准备 compaction（计算切点、分离消息）
  prepareCompaction(messages: readonly Message[]): CompactionPreparation | null {
    return prepareCompaction(
      messages,
      this.contextWindow,
      this.compactionConfig,
      this.previousSummary,
      this.estimateTokens,
    )
  }

  // 执行 compaction（生成摘要 + 归档 + 状态恢复）
  async compact(
    preparation: CompactionPreparation,
    sessionId?: string,
    signal?: AbortSignal,
  ): Promise<CompactionResult> {
    const result = await compact(preparation, this.summarize, this.compactionConfig, signal)

    // 收集被压缩消息中的状态，合并到累积的恢复状态
    const incomingState = collectRestorationState(preparation.messagesToSummarize)
    this.restorationState = mergeRestorationState(this.restorationState, incomingState)

    // L3: 归档被压缩的消息
    if (sessionId) {
      try {
        const archivePath = await this.archiveStorage.archive(
          sessionId,
          preparation.messagesToSummarize,
          result.summary,
        )
        result.archivePath = archivePath
        logger.info(`Messages archived to ${archivePath}`)
      } catch (err) {
        logger.warn({ error: err }, 'Failed to archive messages')
        // 归档失败不影响压缩结果
      }
    }

    // 保存摘要供迭代压缩使用
    this.previousSummary = result.summary

    return result
  }

  // 4-stage pipeline: snip → prune → micro-compact → full compaction
  async process(
    messages: readonly Message[],
    sessionId?: string,
    signal?: AbortSignal,
  ): Promise<{
    messages: Message[]
    summary?: string
    archivePath?: string
    snippd: boolean
    pruned: boolean
    microCompacted: boolean
    compacted: boolean
  }> {
    let current = [...messages]
    let snippd = false
    let pruned = false
    let microCompacted = false
    let compacted = false
    let summary: string | undefined
    let archivePath: string | undefined

    // Phase 1: Snip — truncate oversized individual outputs (eager, no threshold)
    const snipResult = snip(current, this.snipConfig)
    if (snipResult.changed) {
      current = snipResult.messages
      snippd = true
      logger.info(`Snip: truncated ${snipResult.snippedCount} oversized tool outputs`)
    }

    // Phase 2: Prune — replace old tool outputs with placeholders (70% trigger)
    if (this.needsPrune(current)) {
      const pruneResult = this.prune(current)
      if (pruneResult.changed) {
        current = pruneResult.messages
        pruned = true
        logger.info(
          `Prune: removed ${pruneResult.prunedCount} tool outputs, saved ~${pruneResult.tokensSaved} tokens`,
        )
      }
    }

    // Phase 3: Time-based micro-compact — fold old outputs by age (no LLM)
    const timeMicroResult = timeMicroCompact(current, this.timeMicroConfig, this.estimateTokens)
    if (timeMicroResult.changed) {
      current = timeMicroResult.messages
      microCompacted = true
      logger.info(
        `Time micro: folded ${timeMicroResult.foldedCount} outputs, saved ~${timeMicroResult.tokensSaved} tokens`,
      )
    }

    // Phase 4a: Cached micro-compact — lightweight LLM summary (80% trigger)
    if (!this.needsCompaction(current)) {
      const microResult = await cachedMicroCompact(
        current,
        this.contextWindow,
        this.summarize,
        this.microCache,
        this.cachedMicroConfig,
        this.estimateTokens,
        signal,
      )
      if (microResult.changed) {
        current = microResult.messages
        microCompacted = true
        summary = microResult.summary
        logger.info(`Cached micro-compact: ${microResult.cached ? 'cache hit' : 'cache miss'}`)
        return {
          messages: current,
          summary,
          archivePath,
          snippd,
          pruned,
          microCompacted,
          compacted,
        }
      }
    }

    // Phase 4b: Full compaction — LLM summarization (85% trigger)
    if (this.needsCompaction(current)) {
      const preparation = this.prepareCompaction(current)

      if (preparation) {
        const result = await this.compact(preparation, sessionId, signal)
        compacted = true
        summary = result.summary
        archivePath = result.archivePath

        const summaryText = archivePath
          ? buildArchiveReference(archivePath, result.summary)
          : result.summary

        const summaryMessage: Message = {
          role: 'user',
          content: [{ type: 'text', text: `[Conversation Summary]\n\n${summaryText}` }],
          timestamp: Date.now(),
        }

        // 构建状态恢复消息（文件、计划、技能、工具、后台 Agent）
        const restorationMsg = buildRestorationMessage(this.restorationState)
        const restoredMessages: Message[] = [summaryMessage]
        if (restorationMsg) {
          restoredMessages.push({
            role: 'user',
            content: [{ type: 'text', text: restorationMsg }],
            timestamp: Date.now(),
          })
        }
        restoredMessages.push(...preparation.preservedMessages)

        current = restoredMessages

        logger.info(
          `Compaction: ${preparation.messagesToSummarize.length} messages → summary, kept ${preparation.preservedMessages.length}`,
        )
      }
    }

    return { messages: current, summary, archivePath, snippd, pruned, microCompacted, compacted }
  }

  // 准备部分压缩（用户可选择消息范围）
  preparePartialCompact(
    messages: readonly Message[],
    options: PartialCompactOptions,
  ): CompactionPreparation | null {
    return preparePartialCompact(
      messages,
      this.contextWindow,
      options,
      this.compactionConfig,
      this.previousSummary,
      this.estimateTokens,
    )
  }

  // 设置当前活动计划（在压缩后恢复时注入）
  setActivePlan(planName: string | null): void {
    this.restorationState.activePlan = planName
  }

  // 设置 MCP 服务器信息（在压缩后恢复时注入）
  setMcpServers(servers: import('./state-restoration').McpServerSnapshot[]): void {
    this.restorationState.mcpServers = servers
  }

  // 获取当前的恢复状态快照
  getRestorationState(): Readonly<RestorationState> {
    return {
      ...this.restorationState,
      recentFiles: [...this.restorationState.recentFiles],
      activeTodos: [...this.restorationState.activeTodos],
      invokedSkills: [...this.restorationState.invokedSkills],
      loadedDeferredTools: [...this.restorationState.loadedDeferredTools],
      asyncAgents: [...this.restorationState.asyncAgents],
      mcpServers: this.restorationState.mcpServers.map((server) => ({
        ...server,
        toolNames: [...server.toolNames],
      })),
    }
  }

  async listArchives(sessionId: string): Promise<ArchiveEntry[]> {
    return this.archiveStorage.list(sessionId)
  }

  async readArchive(archivePath: string): Promise<string> {
    return this.archiveStorage.read(archivePath)
  }

  dispose(): void {
    this.persistent.dispose()
  }
}

export function createMemoryManager(config: MemoryManagerConfig): MemoryManager {
  return new MemoryManager(config)
}

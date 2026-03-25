// @vitamin/memory — MemoryManager 统一入口
//
// 三层记忆管理器，协调 L1/L2/L3 子系统。

import { createLogger } from '@vitamin/shared'

import { PersistentMemory, FileSystemMemoryStore } from './persistent-memory'
import { prune } from './prune'
import { needsCompaction, isEligibleForManualCompact, prepareCompaction, compact } from './compaction'
import { InMemoryArchiveStorage } from './archive'
import {
  estimateTokens as defaultEstimateTokens,
  estimateMessagesTokens,
} from './token-estimator'
import {
  computeMemoryDefaults,
  resolveContextSize,
  DEFAULT_COMPACTION_CONFIG,
  DEFAULT_PRUNE_CONFIG,
} from './defaults'
import { buildArchiveReference } from './prompts'

import type { Message } from '@vitamin/ai'
import type {
  MemoryManagerConfig,
  CompactionConfig,
  PruneConfig,
  PruneResult,
  CompactionPreparation,
  CompactionResult,
  ArchiveEntry,
  ArchiveStorage,
} from './types'

const log = createLogger('@vitamin/memory')

export class MemoryManager {
  private readonly persistent: PersistentMemory
  private readonly archiveStorage: ArchiveStorage
  private readonly summarize: MemoryManagerConfig['summarize']
  private readonly estimateTokens: (text: string) => number
  private readonly contextWindow: number
  private readonly compactionConfig: CompactionConfig
  private readonly pruneConfig: PruneConfig
  private previousSummary?: string

  constructor(config: MemoryManagerConfig) {
    // Model-aware defaults
    const defaults = config.model
      ? computeMemoryDefaults(config.model)
      : { compaction: DEFAULT_COMPACTION_CONFIG, prune: DEFAULT_PRUNE_CONFIG }

    this.compactionConfig = { ...defaults.compaction, ...config.compaction }
    this.pruneConfig = { ...defaults.prune, ...config.prune }
    this.contextWindow = config.model?.contextWindow ?? 200_000
    this.summarize = config.summarize
    this.estimateTokens = config.estimateTokens ?? defaultEstimateTokens
    this.archiveStorage = config.archiveStorage ?? new InMemoryArchiveStorage()

    // L1 Persistent Memory
    const store = config.memoryStore ?? new FileSystemMemoryStore()
    this.persistent = new PersistentMemory(
      store,
      config.sources,
    )
  }

  // ══════════ L1 Persistent Memory ══════════

  /** 加载所有知识 sources 到内存 */
  async loadMemory(): Promise<void> {
    await this.persistent.load()
  }

  /** 获取格式化的 memory 注入文本（用于 system prompt） */
  getMemoryPrompt(): string {
    return this.persistent.getInjection()
  }

  /** 重新加载知识 sources */
  async reloadMemory(): Promise<void> {
    await this.persistent.reload()
  }

  /** 获取原始记忆内容 */
  getMemories(): ReadonlyMap<string, string> {
    return this.persistent.getMemories()
  }

  // ══════════ L2 Prune ══════════

  /** 检查是否需要 prune */
  needsPrune(messages: readonly Message[]): boolean {
    const currentTokens = estimateMessagesTokens(messages, this.estimateTokens)
    const triggerTokens = resolveContextSize(this.pruneConfig.trigger, this.contextWindow)
    return currentTokens >= triggerTokens
  }

  /** 执行 prune（无 LLM 裁剪旧 tool call 输出） */
  prune(messages: readonly Message[]): PruneResult {
    return prune(messages, this.contextWindow, this.pruneConfig, this.estimateTokens)
  }

  // ══════════ L2 Compaction ══════════

  /** 检查是否需要 compaction */
  needsCompaction(messages: readonly Message[]): boolean {
    return needsCompaction(messages, this.contextWindow, this.compactionConfig, this.estimateTokens)
  }

  /** 手动压缩资格评估 */
  isEligibleForManualCompact(messages: readonly Message[]): boolean {
    return isEligibleForManualCompact(messages, this.contextWindow, this.compactionConfig, this.estimateTokens)
  }

  /** 准备 compaction（计算切点、分离消息） */
  prepareCompaction(messages: readonly Message[]): CompactionPreparation | null {
    return prepareCompaction(
      messages,
      this.contextWindow,
      this.compactionConfig,
      this.previousSummary,
      this.estimateTokens,
    )
  }

  /** 执行 compaction（生成摘要 + 可选归档） */
  async compact(
    preparation: CompactionPreparation,
    sessionId?: string,
    signal?: AbortSignal,
  ): Promise<CompactionResult> {
    const result = await compact(
      preparation,
      this.summarize,
      this.compactionConfig,
      signal,
    )

    // L3: 归档被压缩的消息
    if (sessionId) {
      try {
        const archivePath = await this.archiveStorage.archive(
          sessionId,
          preparation.messagesToSummarize,
          result.summary,
        )
        result.archivePath = archivePath
        log.info(`Messages archived to ${archivePath}`)
      } catch (err) {
        log.warn({ error: err }, 'Failed to archive messages')
        // 归档失败不影响压缩结果
      }
    }

    // 保存摘要供迭代压缩使用
    this.previousSummary = result.summary

    return result
  }

  /**
   * 一键流程: prune → compaction → archive
   * 
   * 返回处理后的消息列表 + 摘要消息（如果发生压缩）。
   * 调用方（AgentSession）负责将结果写入 session。
   */
  async process(
    messages: readonly Message[],
    sessionId?: string,
    signal?: AbortSignal,
  ): Promise<{
    messages: Message[]
    summary?: string
    archivePath?: string
    pruned: boolean
    compacted: boolean
  }> {
    let current = [...messages]
    let pruned = false
    let compacted = false
    let summary: string | undefined
    let archivePath: string | undefined

    // Phase 1: Prune
    if (this.needsPrune(current)) {
      const pruneResult = this.prune(current)
      if (pruneResult.changed) {
        current = pruneResult.messages
        pruned = true
        log.info(`Prune: removed ${pruneResult.prunedCount} tool outputs, saved ~${pruneResult.tokensSaved} tokens`)
      }
    }

    // Phase 2: Compaction
    if (this.needsCompaction(current)) {
      const preparation = this.prepareCompaction(current)

      if (preparation) {
        const result = await this.compact(preparation, sessionId, signal)
        compacted = true
        summary = result.summary
        archivePath = result.archivePath

        // 构建压缩后的消息列表: [摘要消息] + [保留的消息]
        const summaryText = archivePath
          ? buildArchiveReference(archivePath, result.summary)
          : result.summary

        const summaryMessage: Message = {
          role: 'user',
          content: [{ type: 'text', text: `[Conversation Summary]\n\n${summaryText}` }],
          timestamp: Date.now(),
        }

        current = [summaryMessage, ...preparation.preservedMessages]

        log.info(`Compaction: ${preparation.messagesToSummarize.length} messages → summary, kept ${preparation.preservedMessages.length}`)
      }
    }

    return { messages: current, summary, archivePath, pruned, compacted }
  }

  // ══════════ L3 Archive ══════════

  /** 获取 session 的归档列表 */
  async listArchives(sessionId: string): Promise<ArchiveEntry[]> {
    return this.archiveStorage.list(sessionId)
  }

  /** 读取归档内容 */
  async readArchive(archivePath: string): Promise<string> {
    return this.archiveStorage.read(archivePath)
  }

  // ══════════ Lifecycle ══════════

  dispose(): void {
    this.persistent.dispose()
  }
}

/** 工厂函数 */
export function createMemoryManager(config: MemoryManagerConfig): MemoryManager {
  return new MemoryManager(config)
}

// @vitamin/memory — L2 Phase 2: Compaction (LLM 摘要)
//
// 借鉴 pi-mono 的精确切点算法 + opencode 的结构化摘要。
// 当 Prune 后 token 仍超标，触发 LLM 生成结构化摘要。

import { createLogger } from '@vitamin/shared'
import {
  estimateTokens as defaultEstimateTokens,
  estimateMessagesTokens,
  messageToText,
} from './token-estimator'
import { resolveContextSize, DEFAULT_COMPACTION_CONFIG } from './defaults'
import { buildSummarizationPrompt, buildTurnPrefixPrompt } from './prompts'

import type { Message } from '@vitamin/ai'
import type {
  CompactionConfig,
  CompactionPreparation,
  CompactionResult,
  CutPoint,
} from './types'

const log = createLogger('@vitamin/memory:compaction')

/**
 * 查找切点 — 决定消息列表中哪里开始保留。
 * 
 * 从尾部倒序累积 token，找到保留 keepRecent 的边界。
 * 切点必须在 user / assistant 消息边界（不在 tool_result 处切）。
 */
export function findCutPoint(
  messages: readonly Message[],
  keepRecentTokens: number,
  estimator = defaultEstimateTokens,
): CutPoint {
  let accumulatedTokens = 0
  let rawCutIndex = 0

  // 从尾部倒序累积 token，找到保留 keepRecentTokens 的边界
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimator(messageToText(messages[i]!))
    accumulatedTokens += msgTokens

    if (accumulatedTokens >= keepRecentTokens) {
      rawCutIndex = i + 1
      break
    }
  }

  // 确保切点在有效范围内
  rawCutIndex = Math.max(0, Math.min(rawCutIndex, messages.length - 1))

  // 调整切点到 user / assistant 消息边界（不在 tool_result 处切）
  let adjustedCutIndex = rawCutIndex
  while (adjustedCutIndex < messages.length) {
    const msg = messages[adjustedCutIndex]!
    if (msg.role === 'user' || msg.role === 'assistant') break
    adjustedCutIndex++
  }

  // 检查是否切在 turn 中间
  // 一个完整 turn = assistant + 后续的 tool_result 消息
  // 如果 adjustedCutIndex 处是 tool_result，说明前面的 assistant 被切开了
  let isSplitTurn = false
  let turnStartIndex = adjustedCutIndex

  if (adjustedCutIndex > 0 && adjustedCutIndex < messages.length) {
    const msgAtCut = messages[adjustedCutIndex]!
    // 如果切点处是 assistant，检查前面是否有属于同一 turn 的 tool_result
    if (msgAtCut.role === 'assistant') {
      // 向前查找这个 turn 的起始点
      let lookback = adjustedCutIndex - 1
      while (lookback >= 0 && messages[lookback]!.role === 'tool_result') {
        lookback--
      }
      // 如果前面有 assistant 消息，说明切在了 assistant turn 中间
      if (lookback >= 0 && messages[lookback]!.role === 'assistant') {
        isSplitTurn = true
        turnStartIndex = lookback
      }
    }
  }

  return {
    firstKeptIndex: adjustedCutIndex,
    turnStartIndex,
    isSplitTurn,
  }
}

/**
 * 检查是否需要 compaction。
 */
export function needsCompaction(
  messages: readonly Message[],
  contextWindow: number,
  config: Partial<CompactionConfig> = {},
  estimator = defaultEstimateTokens,
): boolean {
  const cfg = { ...DEFAULT_COMPACTION_CONFIG, ...config }
  if (!cfg.enabled) return false

  const triggerTokens = resolveContextSize(cfg.trigger, contextWindow)
  const currentTokens = estimateMessagesTokens(messages, estimator)

  return currentTokens >= triggerTokens
}

/**
 * 手动压缩资格检查 — 达到自动阈值的 50% 时允许手动压缩。
 */
export function isEligibleForManualCompact(
  messages: readonly Message[],
  contextWindow: number,
  config: Partial<CompactionConfig> = {},
  estimator = defaultEstimateTokens,
): boolean {
  const cfg = { ...DEFAULT_COMPACTION_CONFIG, ...config }
  const triggerTokens = resolveContextSize(cfg.trigger, contextWindow)
  const currentTokens = estimateMessagesTokens(messages, estimator)

  return currentTokens >= triggerTokens * 0.5
}

/**
 * 准备 compaction — 计算切点、分离消息、提取文件操作。
 */
export function prepareCompaction(
  messages: readonly Message[],
  contextWindow: number,
  config: Partial<CompactionConfig> = {},
  previousSummary?: string,
  estimator = defaultEstimateTokens,
): CompactionPreparation | null {
  const cfg = { ...DEFAULT_COMPACTION_CONFIG, ...config }
  const keepRecentTokens = resolveContextSize(cfg.keepRecent, contextWindow)
  const currentTokens = estimateMessagesTokens(messages, estimator)

  if (messages.length <= 2) {
    log.debug('Too few messages to compact')
    return null
  }

  const cutPoint = findCutPoint(messages, keepRecentTokens, estimator)

  if (cutPoint.firstKeptIndex <= 0) {
    log.debug('Cut point at beginning, nothing to compact')
    return null
  }

  const messagesToSummarize = messages.slice(0, cutPoint.firstKeptIndex)
  const preservedMessages = messages.slice(cutPoint.firstKeptIndex)

  // Split turn 处理
  let turnPrefixMessages: Message[] = []
  if (cutPoint.isSplitTurn) {
    turnPrefixMessages = messages.slice(cutPoint.turnStartIndex, cutPoint.firstKeptIndex)
  }

  // 提取文件操作记录
  const fileOps = extractFileOps(messagesToSummarize)

  return {
    messagesToSummarize: [...messagesToSummarize],
    turnPrefixMessages,
    preservedMessages: [...preservedMessages],
    isSplitTurn: cutPoint.isSplitTurn,
    tokensBefore: currentTokens,
    previousSummary,
    fileOps,
  }
}

/**
 * 执行 compaction — 调用 LLM 生成摘要。
 */
export async function compact(
  preparation: CompactionPreparation,
  summarize: (prompt: string, options?: { maxTokens?: number; signal?: AbortSignal }) => Promise<string>,
  config: Partial<CompactionConfig> = {},
  signal?: AbortSignal,
): Promise<CompactionResult> {
  const cfg = { ...DEFAULT_COMPACTION_CONFIG, ...config }

  log.info(`Compacting ${preparation.messagesToSummarize.length} messages`)

  // 构建消息文本
  const messagesText = preparation.messagesToSummarize
    .map(formatMessageForSummary)
    .join('\n\n')

  // 构建摘要 prompt
  const prompt = buildSummarizationPrompt(
    messagesText,
    preparation.previousSummary,
    cfg.customInstructions,
  )

  // 调用 LLM 生成摘要
  let summary = await summarize(prompt, {
    maxTokens: cfg.reserveTokens,
    signal,
  })

  // 追加文件操作记录
  if (preparation.fileOps.read.length > 0 || preparation.fileOps.modified.length > 0) {
    const fileOpsText = formatFileOps(preparation.fileOps)
    // 如果摘要中已有 File Operations 部分则不重复追加
    if (!summary.includes('## File Operations')) {
      summary += `\n\n${fileOpsText}`
    }
  }

  // Split turn — 生成 turn prefix 摘要
  if (preparation.isSplitTurn && preparation.turnPrefixMessages.length > 0) {
    const prefixText = preparation.turnPrefixMessages
      .map(formatMessageForSummary)
      .join('\n\n')
    const prefixPrompt = buildTurnPrefixPrompt(prefixText)
    const prefixSummary = await summarize(prefixPrompt, { signal })
    summary = `${summary}\n\n---\n\n${prefixSummary}`
  }

  log.info(`Compaction complete: summary ${summary.length} chars`)

  return {
    summary,
    firstKeptIndex: preparation.messagesToSummarize.length,
    tokensBefore: preparation.tokensBefore,
  }
}

// ══════════════════════════════════════════════════════
// 内部辅助
// ══════════════════════════════════════════════════════

/** 格式化单条消息用于摘要 */
function formatMessageForSummary(msg: Message): string {
  const roleLabel = msg.role === 'user' ? 'Human'
    : msg.role === 'assistant' ? 'Assistant'
    : `Tool[${msg.toolName}]`

  const content = messageToText(msg)
  return `${roleLabel}: ${content}`
}

/** 从消息中提取文件操作记录 */
function extractFileOps(messages: readonly Message[]): { read: string[]; modified: string[] } {
  const read = new Set<string>()
  const modified = new Set<string>()

  for (const msg of messages) {
    if (msg.role !== 'tool_result') continue

    const toolMsg = msg
    const toolName = toolMsg.toolName
    const content = messageToText(msg)

    // 根据 tool 名称分类
    if (toolName === 'read_file' || toolName === 'grep_search' || toolName === 'file_search') {
      // 尝试从 content 提取文件路径
      const pathMatch = content.match(/(?:^|\s)(\/[^\s]+\.[a-z]+)/i)
      if (pathMatch?.[1]) read.add(pathMatch[1])
    } else if (
      toolName === 'write_file' ||
      toolName === 'edit_file' ||
      toolName === 'create_file' ||
      toolName === 'replace_string_in_file'
    ) {
      const pathMatch = content.match(/(?:^|\s)(\/[^\s]+\.[a-z]+)/i)
      if (pathMatch?.[1]) modified.add(pathMatch[1])
    }
  }

  return {
    read: [...read],
    modified: [...modified],
  }
}

/** 格式化文件操作记录 */
function formatFileOps(fileOps: { read: string[]; modified: string[] }): string {
  const parts: string[] = ['## File Operations']

  if (fileOps.read.length > 0) {
    parts.push('### Read')
    for (const path of fileOps.read) {
      parts.push(`- ${path}`)
    }
  }

  if (fileOps.modified.length > 0) {
    parts.push('### Modified')
    for (const path of fileOps.modified) {
      parts.push(`- ${path}`)
    }
  }

  return parts.join('\n')
}

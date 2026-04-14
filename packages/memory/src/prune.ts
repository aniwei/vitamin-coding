import { createLogger } from '@vitamin/shared'
import {
  estimateTokens as defaultEstimateTokens,
  estimateMessagesTokens,
  messageToText,
} from './token-estimator'
import { resolveContextSize, DEFAULT_PRUNE_CONFIG } from './defaults'

import type { Message, ToolResultMessage } from '@vitamin/ai'
import type { PruneConfig, PruneResult } from './types'

const log = createLogger('@vitamin/memory:prune')

// Prune — 裁剪旧 tool call 输出，释放 token 空间。
// 不需要 LLM 调用，是 Compaction 前的轻量优化。
// 策略:
// 1. 从尾部倒序扫描消息
// 2. 保护最近 `protect` 范围内的 tool 输出不动
// 3. 超出保护范围后，将 tool_result 的 content 替换为占位文本
// 4. 对 truncateTools 列表中的 tool call，额外截断 arguments
// 5. 累计裁剪量不足 minimum 则不执行
export function prune(
  messages: readonly Message[],
  contextWindow: number,
  config: Partial<PruneConfig> = {},
  estimator = defaultEstimateTokens,
): PruneResult {
  const cfg: PruneConfig = { ...DEFAULT_PRUNE_CONFIG, ...config }

  const triggerTokens = resolveContextSize(cfg.trigger, contextWindow)
  const currentTokens = estimateMessagesTokens(messages, estimator)

  // 未达到触发阈值
  if (currentTokens < triggerTokens) {
    return { messages: [...messages], prunedCount: 0, tokensSaved: 0, changed: false }
  }

  const protectTokens = resolveContextSize(cfg.protect, contextWindow)
  const truncateToolSet = new Set(cfg.truncateTools)
  const protectedToolSet = new Set(cfg.protectedTools)

  // 从尾部倒序扫描，计算保护范围边界
  let accumulatedTokens = 0
  let protectBoundary = messages.length // 保护边界索引（之后的消息受保护）

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!
    const msgTokens = estimator(messageToText(msg))
    accumulatedTokens += msgTokens

    if (accumulatedTokens >= protectTokens) {
      protectBoundary = i + 1
      break
    }
  }

  // 执行 prune — 克隆消息列表
  const result = messages.map((msg, i) => {
    // 保护范围内的消息不动
    if (i >= protectBoundary) {
      return msg
    }

    // 只处理 tool_result 消息
    if (msg.role === 'tool_result') {
      const toolMsg = msg as ToolResultMessage

      // 受保护的 tool 不裁剪
      if (protectedToolSet.has(toolMsg.toolName)) {
        return msg
      }

      return pruneToolResult(toolMsg, estimator)
    }

    // 对 assistant 消息中的 tool_call 截断参数
    if (msg.role === 'assistant' && i < protectBoundary) {
      return pruneAssistantToolCalls(msg, truncateToolSet, cfg.truncateMaxLength)
    }

    return msg
  })

  // 计算实际节省
  const newTokens = estimateMessagesTokens(result, estimator)
  const tokensSaved = currentTokens - newTokens

  // 节省不足 minimum，回退到原始消息
  if (tokensSaved < cfg.minimum) {
    log.debug(`Prune skipped: savings ${tokensSaved} < minimum ${cfg.minimum}`)
    return { messages: [...messages], prunedCount: 0, tokensSaved: 0, changed: false }
  }

  const prunedCount = result.filter((msg, i) => msg !== messages[i]).length

  log.info(`Pruned ${prunedCount} messages, saved ~${tokensSaved} tokens`)

  return { messages: result, prunedCount, tokensSaved, changed: true }
}

// 裁剪 tool_result 的 content — 替换为占位文本
function pruneToolResult(
  msg: ToolResultMessage,
  estimator: (text: string) => number,
): ToolResultMessage {
  const originalText = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('')
  const originalTokens = estimator(originalText)

  if (originalTokens < 100) {
    return msg
  } // 小输出不值得裁剪

  return {
    ...msg,
    content: [
      {
        type: 'text' as const,
        text: `[output pruned — ${originalTokens} tokens]`,
      },
    ],
  }
}

// 裁剪 assistant 消息中的 tool_call arguments
function pruneAssistantToolCalls(
  msg: Message & { role: 'assistant' },
  truncateToolSet: Set<string>,
  maxLength: number,
): Message {
  if (!Array.isArray(msg.content)) {
    return msg
  }

  let changed = false
  const newContent = msg.content.map((part) => {
    if (part.type !== 'tool_call') {
      return part
    }
    if (!truncateToolSet.has(part.name)) {
      return part
    }

    const argsStr = JSON.stringify(part.arguments)
    if (argsStr.length <= maxLength) {
      return part
    }

    changed = true
    return {
      ...part,
      arguments: { _truncated: `${argsStr.slice(0, maxLength)}...(truncated)` } as Record<
        string,
        unknown
      >,
    }
  })

  if (!changed) {
    return msg
  }

  return { ...msg, content: newContent }
}

import { getTokensFromUsage } from '@x-mars/ai'
import type { Message, AssistantMessage } from '@x-mars/ai'
import type { ContextTokenEstimate } from './types'

export { getTokensFromUsage }

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function messageToText(message: Message): string {
  if (typeof message.content === 'string') {
    return message.content
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((c) => {
        switch (c.type) {
          case 'text':
            return c.text
          case 'thinking':
            return c.text
          case 'tool_call':
            return `${c.name}(${JSON.stringify(c.arguments)})`
          case 'image':
            return '[image]'
          default:
            return ''
        }
      })
      .filter(Boolean)
      .join('\n')
  }

  return JSON.stringify(message)
}

export function estimateMessageTokens(message: Message, estimator = estimateTokens): number {
  const roleOverhead = 4
  return roleOverhead + estimator(messageToText(message))
}

export function estimateMessagesTokens(
  messages: readonly Message[],
  estimator = estimateTokens,
): number {
  let total = 0
  for (const msg of messages) {
    total += estimateMessageTokens(msg, estimator)
  }
  return total
}

function isAssistantMessage(msg: Message): msg is AssistantMessage {
  return msg.role === 'assistant'
}

// 估算上下文总 token。
// 策略:
// 1. 找到最后一条带 usage 的 assistant 消息
// 2. 使用 usage.inputTokens 作为基准（代表了到该消息为止的全部输入 token）
// 3. 估算 usage 之后的尾部消息 token
// 4. 合计 = usage.inputTokens + trailing estimated
export function estimateContextTokens(
  messages: readonly Message[],
  estimator = estimateTokens,
): ContextTokenEstimate {
  let lastUsageIndex = -1
  let fromUsage = 0

  // 从尾部找最后一条有 usage 的 assistant 消息
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg) {
      continue
    }
    if (isAssistantMessage(msg) && msg.usage) {
      lastUsageIndex = i
      // inputTokens 代表了 LLM 看到的全部输入 + 输出
      fromUsage = msg.usage.inputTokens + msg.usage.outputTokens
      break
    }
  }

  // 估算 usage 之后的尾部消息
  let fromEstimate = 0
  if (lastUsageIndex >= 0) {
    for (let i = lastUsageIndex + 1; i < messages.length; i++) {
      const msg = messages[i]
      if (!msg) {
        continue
      }
      fromEstimate += estimateMessageTokens(msg, estimator)
    }
  } else {
    // 没有 usage 数据，全部使用估算
    fromEstimate = estimateMessagesTokens(messages, estimator)
  }

  return {
    total: fromUsage + fromEstimate,
    fromUsage,
    fromEstimate,
    lastUsageIndex,
  }
}

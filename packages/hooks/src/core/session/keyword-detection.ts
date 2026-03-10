// 关键词检测 Hook — 检测 plan/build 等触发词
import type { ChatMessageInput, ChatMessageOutput, HookRegistration } from '../../types'

// plan/build 模式关键词
const PLAN_KEYWORDS = ['plan', 'design', 'architect', 'roadmap', 'blueprint']
const BUILD_KEYWORDS = ['build', 'implement', 'create', 'develop', 'construct']

export function createKeywordDetectionHook(): HookRegistration<'chat.message.before'> {
  return {
    name: 'keyword-detection',
    timing: 'chat.message.before',
    priority: 30,
    enabled: true,
    handler(input: ChatMessageInput, output: ChatMessageOutput): void {
      const text = extractText(input.message)
      if (!text) return

      const lower = text.toLowerCase()
      const hasPlan = PLAN_KEYWORDS.some((kw) => lower.includes(kw))
      const hasBuild = BUILD_KEYWORDS.some((kw) => lower.includes(kw))

      if (hasPlan) {
        output.metadata.detectedKeyword = 'plan'
      }
      if (hasBuild) {
        output.metadata.detectedKeyword = hasPlan ? 'plan' : 'build'
      }
    },
  }
}

// 从消息中提取文本内容
function extractText(message: unknown): string | null {
  if (typeof message !== 'object' || message === null) return null
  const msg = message as Record<string, unknown>
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((part: unknown): part is { type: string; text: string } =>
        typeof part === 'object' && part !== null && (part as Record<string, unknown>).type === 'text',
      )
      .map((part) => part.text)
      .join(' ')
  }
  return null
}

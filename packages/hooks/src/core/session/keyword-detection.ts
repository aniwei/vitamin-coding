import { defineHook } from '../../hook-spec'
import type { HookSpec } from '../../hook-spec'

const PLAN_KEYWORDS = ['plan', 'design', 'architect', 'roadmap', 'blueprint']
const BUILD_KEYWORDS = ['build', 'implement', 'create', 'develop', 'construct']

export function createKeywordDetectionHook(): HookSpec {
  return defineHook({
    name: 'keyword-detection',
    timing: 'chat.message.before',
    priority: 30,
    handle(input, output) {
      const text = extractText(input.message)
      if (!text) {
        return
      }

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
  })
}

function extractText(message: unknown): string | null {
  if (typeof message !== 'object' || message === null) {
    return null
  }
  if (!('content' in message)) {
    return null
  }

  const content = (message as { content: unknown }).content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .filter(
        (part: unknown): part is { type: string; text: string } =>
          typeof part === 'object' &&
          part !== null &&
          'type' in part &&
          (part as { type: unknown }).type === 'text',
      )
      .map((part) => part.text)
      .join(' ')
  }
  return null
}

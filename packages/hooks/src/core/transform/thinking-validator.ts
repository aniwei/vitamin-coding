// Thinking Block 校验 Hook — 确保 thinking block 格式正确
import type { HookRegistration, MessagesTransformInput, MessagesTransformOutput } from '../../types'

export function createThinkingValidatorHook(): HookRegistration<'messages.transform'> {
  return {
    name: 'thinking-validator',
    timing: 'messages.transform',
    priority: 20,
    enabled: true,
    handler(_input: MessagesTransformInput, output: MessagesTransformOutput): void {
      // 遍历消息，修复/移除无效的 thinking block
      output.messages = output.messages.map((msg) => {
        if (!isAssistantMessage(msg)) return msg
        const content = getAssistantContent(msg)
        if (!Array.isArray(content)) return msg

        // 过滤掉空 thinking block
        const filtered = content.filter((part: Record<string, unknown>) => {
          if (part.type === 'thinking' && (!part.thinking || (part.thinking as string).trim() === '')) {
            return false
          }
          return true
        })

        return { ...msg, content: filtered } as typeof msg
      })
    },
  }
}

function isAssistantMessage(msg: unknown): boolean {
  if (typeof msg !== 'object' || msg === null) return false
  return (msg as Record<string, unknown>).role === 'assistant'
}

function getAssistantContent(msg: unknown): unknown {
  if (typeof msg !== 'object' || msg === null) return undefined
  return (msg as Record<string, unknown>).content
}

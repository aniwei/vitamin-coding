import { defineHook } from '../../hook-spec'
import type { HookSpec } from '../../hook-spec'

export function createThinkingValidatorHook(): HookSpec {
  return defineHook({
    name: 'thinking-validator',
    timing: 'messages.transform',
    priority: 20,
    handle(_input, output) {
      output.messages = output.messages.map((msg) => {
        if (!isAssistantMessage(msg)) {
          return msg
        }
        const content = getAssistantContent(msg)
        if (!Array.isArray(content)) {
          return msg
        }

        const filtered = content.filter((part: Record<string, unknown>) => {
          if (
            part.type === 'thinking' &&
            (typeof part.thinking !== 'string' || part.thinking.trim() === '')
          ) {
            return false
          }
          return true
        })

        return { ...msg, content: filtered }
      })
    },
  })
}

function isAssistantMessage(msg: unknown): msg is { role: 'assistant'; content: unknown } {
  return typeof msg === 'object' && msg !== null && 'role' in msg && msg.role === 'assistant'
}

function getAssistantContent(msg: { role: 'assistant'; content: unknown }): unknown {
  return msg.content
}

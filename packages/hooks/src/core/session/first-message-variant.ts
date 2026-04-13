// 首条消息变体 Hook — 首次对话特殊处理
import { defineHook } from '../../hook-spec'
import type { HookSpec } from '../../hook-spec'

export function createFirstMessageVariantHook(): HookSpec {
  return defineHook({
    name: 'first-message-variant',
    timing: 'chat.message.before',
    priority: 10,
    handle(input, output) {
      // 标记首条消息（用于下游 Hook 和 Agent 决策）
      if (input.isFirstMessage) {
        output.metadata.isFirstMessage = true
        output.metadata.variant = 'first-message'
      }
    },
  })
}

// 首条消息变体 Hook — 首次对话特殊处理
import type { ChatMessageInput, ChatMessageOutput, HookRegistration } from '../../types'

export function createFirstMessageVariantHook(): HookRegistration<'chat.message.before'> {
  return {
    name: 'first-message-variant',
    timing: 'chat.message.before',
    priority: 10,
    enabled: true,
    handler(_input: ChatMessageInput, output: ChatMessageOutput): void {
      // 标记首条消息（用于下游 Hook 和 Agent 决策）
      if (_input.isFirstMessage) {
        output.metadata.isFirstMessage = true
        output.metadata.variant = 'first-message'
      }
    },
  }
}

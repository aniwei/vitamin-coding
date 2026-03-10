// 会话历史 Hook — 注入会话历史信息
import type { ChatMessageInput, ChatMessageOutput, HookRegistration } from '../../types'

export function createSessionHistoryHook(): HookRegistration<'chat.message.before'> {
  return {
    name: 'session-history',
    timing: 'chat.message.before',
    priority: 40,
    enabled: true,
    handler(_input: ChatMessageInput, output: ChatMessageOutput): void {
      // 注入会话元信息供下游使用
      output.metadata.sessionId = _input.sessionId
    },
  }
}

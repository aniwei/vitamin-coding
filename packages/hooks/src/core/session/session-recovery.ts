// 会话恢复 Hook — 恢复已有会话时注入上下文
import type { ChatMessageInput, ChatMessageOutput, HookRegistration } from '../../types'

export function createSessionRecoveryHook(): HookRegistration<'chat.message.before'> {
  return {
    name: 'session-recovery',
    timing: 'chat.message.before',
    priority: 20,
    enabled: true,
    handler(_input: ChatMessageInput, output: ChatMessageOutput): void {
      // 会话恢复时注入 metadata 标记
      if (_input.metadata.recovered === true) {
        output.metadata.sessionRecovered = true
      }
    },
  }
}

// 会话恢复 Hook — 恢复已有会话时注入上下文
import { defineHook } from '../../hook-spec'
import type { HookSpec } from '../../hook-spec'

export function createSessionRecoveryHook(): HookSpec {
  return defineHook({
    name: 'session-recovery',
    timing: 'chat.message.before',
    priority: 20,
    handle(input, output) {
      // 会话恢复时注入 metadata 标记
      if (input.metadata.recovered === true) {
        output.metadata.sessionRecovered = true
      }
    },
  })
}

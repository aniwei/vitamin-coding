// 会话历史 Hook — 注入会话历史信息
import { defineHook } from '../../hook-spec'
import type { HookSpec } from '../../hook-spec'

export function createSessionHistoryHook(): HookSpec {
  return defineHook({
    name: 'session-history',
    timing: 'chat.message.before',
    priority: 40,
    handle(input, output) {
      // 注入会话元信息供下游使用
      output.metadata.sessionId = input.sessionId
    },
  })
}

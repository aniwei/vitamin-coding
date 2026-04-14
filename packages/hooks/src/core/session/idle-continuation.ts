// Idle Continuation Hook — 会话空闲时自动继续执行未完成任务 (§S14.2)
import { createLogger } from '@vitamin/shared'
import { defineHook } from '../../hook-spec'
import type { HookSpec } from '../../hook-spec'

const logger = createLogger('hook:idle-continuation')

export interface IdleContinuationConfig {
  // 检查 session metadata 中是否有待执行的计划步骤
  hasPendingWork: (sessionId: string) => boolean
  // 触发继续执行的回调
  resumeWork: (sessionId: string) => void
}

export function createIdleContinuationHook(config: IdleContinuationConfig): HookSpec {
  return defineHook({
    name: 'idle-continuation',
    timing: 'session.idle',
    priority: 50,
    handle(input) {
      const { sessionId } = input

      if (config.hasPendingWork(sessionId)) {
        config.resumeWork(sessionId)
        logger.info('Session %s idle with pending work, resuming', sessionId)
      }
    },
  })
}

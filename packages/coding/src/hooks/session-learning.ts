/**
 * session-learning.ts
 *
 * 在 session 进入空闲状态后，自动触发一次经验提取（每个 session 仅触发一次）。
 * 消息数少于 6 条时跳过，避免无意义的学习请求。
 *
 * 内部维护 learningTriggeredSessions（Set），在 session.deleted 时自动清理。
 *
 * 返回两个 HookSpec，需一起注册：
 *   - session-end-learning (session.idle observer)
 *   - session-learning-cleanup (session.deleted observer)
 */

import type { HookSpec } from '@vitamin/hooks'
import { defineHook } from '@vitamin/hooks'
import { createLogger } from '@vitamin/shared'
import type { AgentSession } from '../session/agent-session'
import type { PromptManager } from '@vitamin/prompt'

const logger = createLogger('@vitamin/coding:hooks:session-learning')

export function createSessionLearningHooks(
  getSession: (id: string) => AgentSession | undefined,
  promptManager: PromptManager,
): HookSpec[] {
  // 内部状态：防止同一 session 重复触发学习
  const triggered = new Set<string>()

  const learningHook = defineHook({
    name: 'session-end-learning',
    timing: 'session.idle',
    handle: async (input) => {
      if (triggered.has(input.sessionId)) return

      const session = getSession(input.sessionId)
      if (!session) return

      const messageCount = session.session.messages().length
      if (messageCount < 6) return

      triggered.add(input.sessionId)
      logger.info('Session idle, prompting for learning: %s', input.sessionId)
      try {
        const sessionEndPrompt = await promptManager.loadSessionEndLearningPrompt()
        await session.prompt(sessionEndPrompt ?? '')
      } catch (err) {
        logger.warn('Learning prompt failed for session %s: %s', input.sessionId, err)
      }
    },
  })

  const cleanupHook = defineHook({
    name: 'session-learning-cleanup',
    timing: 'session.deleted',
    handle: (input) => {
      triggered.delete(input.sessionId)
    },
  })

  return [learningHook, cleanupHook]
}

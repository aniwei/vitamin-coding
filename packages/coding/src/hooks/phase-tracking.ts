/**
 * phase-tracking.ts
 *
 * 追踪 LLM 回复中的 phase 标注，并在下一轮 system prompt 中注入当前 phase 上下文。
 *
 * 内部维护 phaseTracker（sessionId → phase 历史），在 session.deleted 时自动清理，
 * 避免长期运行下的内存泄漏。
 *
 * 返回两个 HookSpec，需一起注册：
 *   - phase-injection (system-prompt.transform, priority=30)
 *   - phase-extraction (chat.message.after, priority=50)
 *   - phase-cleanup (session.deleted observer)
 */

import { extractPhaseFromMessage, injectPhaseContext } from '@vitamin/prompt'
import type { PhaseAnnotation } from '@vitamin/prompt'
import type { HookSpec } from '@vitamin/hooks'
import { defineHook } from '@vitamin/hooks'
import { createLogger } from '@vitamin/shared'

const logger = createLogger('@vitamin/coding:hooks:phase-tracking')

export function createPhaseTrackingHooks(): HookSpec[] {
  // 内部状态：不暴露到 VitaminApp，生命周期与 hook 绑定
  const phaseTracker = new Map<string, string[]>()

  const injectionHook = defineHook({
    name: 'phase-injection',
    timing: 'system-prompt.transform',
    priority: 30,
    handle: async (input, output) => {
      const history = phaseTracker.get(input.sessionId)
      const currentPhase = history?.[history.length - 1]
      if (history && history.length > 0 && currentPhase) {
        const annotation: PhaseAnnotation = {
          currentPhase,
          phaseHistory: history,
        }
        output.systemPrompt = injectPhaseContext(output.systemPrompt, annotation)
      }
    },
  })

  const extractionHook = defineHook({
    name: 'phase-extraction',
    timing: 'chat.message.after',
    priority: 50,
    handle: async (input) => {
      const message = input.message
      if (message.role === 'assistant' && Array.isArray(message.content)) {
        for (const part of message.content) {
          if (
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            'text' in part &&
            part.type === 'text' &&
            typeof part.text === 'string'
          ) {
            const phase = extractPhaseFromMessage(part.text)
            if (phase) {
              const history = phaseTracker.get(input.sessionId) ?? []
              history.push(phase)
              phaseTracker.set(input.sessionId, history)
              logger.debug('Phase extracted: %s (session=%s)', phase, input.sessionId)
            }
          }
        }
      }
    },
  })

  const cleanupHook = defineHook({
    name: 'phase-cleanup',
    timing: 'session.deleted',
    handle: (input) => {
      phaseTracker.delete(input.sessionId)
    },
  })

  return [injectionHook, extractionHook, cleanupHook]
}

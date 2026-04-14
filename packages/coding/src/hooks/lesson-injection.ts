/**
 * lesson-injection.ts
 *
 * 将历史经验教训（operational learning）注入到 system prompt。
 * priority=40（在 phase-injection 之后）。
 */

import { buildLessonInjection } from '@vitamin/prompt'
import type { HookSpec } from '@vitamin/hooks'
import { defineHook } from '@vitamin/hooks'
import type { OperationalLearningStore } from '@vitamin/memory'
import type { PromptManager } from '@vitamin/prompt'

export function createLessonInjectionHook(
  learningStore: OperationalLearningStore,
  promptManager: PromptManager,
): HookSpec {
  return defineHook({
    name: 'lesson-injection',
    timing: 'system-prompt.transform',
    priority: 40,
    handle: async (_input, output) => {
      const lessons = await learningStore.list()
      if (lessons.length > 0) {
        const template = (await promptManager.loadRuntimeLessonsTemplate()) ?? undefined
        const injection = buildLessonInjection(lessons, template)
        if (injection) {
          output.systemPrompt = `${output.systemPrompt}\n\n${injection}`
        }
      }
    },
  })
}

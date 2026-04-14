/**
 * tool-guidance.ts
 *
 * 将 ToolRegistry 的工具说明（guidance snippet）注入到 system prompt。
 * 注入顺序在 environment-injection 之前（priority=20）。
 */

import type { HookSpec } from '@vitamin/hooks'
import { defineHook } from '@vitamin/hooks'
import type { ToolRegistry } from '@vitamin/tools'

export function createToolGuidanceHook(
  toolRegistry: ToolRegistry,
  getPreset: () => 'minimal' | 'standard' | 'full',
): HookSpec {
  return defineHook({
    name: 'tool-guidance-injection',
    timing: 'system-prompt.transform',
    priority: 20,
    handle: async (_input, output) => {
      const guidance = toolRegistry.buildToolGuidance(getPreset())
      if (guidance) {
        output.systemPrompt = `${output.systemPrompt}\n\n${guidance}`
      }
    },
  })
}

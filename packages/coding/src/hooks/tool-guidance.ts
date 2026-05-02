/**
 * tool-guidance.ts
 *
 * 将 ToolRegistry 的工具说明（guidance snippet）注入到 system prompt。
 * 注入顺序在 environment-injection 之前（priority=20）。
 */

import type { HookSpec } from '@vitamin/hooks'
import { defineHook } from '@vitamin/hooks'
import { appendPromptSection } from '@vitamin/prompt'
import type { ToolRegistry } from '@vitamin/tools'

export function createToolGuidanceHook(
  toolRegistry: ToolRegistry,
  getPreset: () => 'minimal' | 'standard' | 'full',
): HookSpec {
  return defineHook({
    name: 'tool-guidance-injection',
    timing: 'system-prompt.sections.transform',
    priority: 20,
    handle: async (_input, output) => {
      const preset = getPreset()
      const availability = toolRegistry.buildToolAvailability(preset)
      if (availability) {
        output.assembly = appendPromptSection(output.assembly, {
          key: 'tool-availability',
          content: availability,
          layer: 'session',
          cacheable: true,
          source: 'tool-registry',
          priority: 18,
        })
      }

      const deferredTools = toolRegistry.buildDeferredToolsGuidance(preset)
      if (deferredTools) {
        output.assembly = appendPromptSection(output.assembly, {
          key: 'deferred-tools',
          content: deferredTools,
          layer: 'session',
          cacheable: true,
          source: 'tool-registry',
          priority: 19,
        })
      }

      const guidance = toolRegistry.buildToolGuidance(preset)
      if (guidance) {
        output.assembly = appendPromptSection(output.assembly, {
          key: 'tool-guidance',
          content: guidance,
          layer: 'session',
          cacheable: true,
          source: 'tool-registry',
          priority: 20,
        })
      }
    },
  })
}

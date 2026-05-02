import type { HookSpec } from '@x-mars/hooks'
import { defineHook } from '@x-mars/hooks'
import { appendPromptSection } from '@x-mars/prompt'
import type { SkillProvider } from '@x-mars/skill'

export function createSkillCatalogHook(provider: SkillProvider): HookSpec {
  return defineHook({
    name: 'skill-catalog-injection',
    timing: 'system-prompt.sections.transform',
    priority: 23,
    handle: async (_input, output) => {
      const catalog = await provider.catalog?.()
      if (!catalog) {
        return
      }

      output.assembly = appendPromptSection(output.assembly, {
        key: 'skill-catalog',
        content: catalog,
        layer: 'session',
        cacheable: true,
        source: 'skill-provider',
        priority: 23,
      })
    },
  })
}

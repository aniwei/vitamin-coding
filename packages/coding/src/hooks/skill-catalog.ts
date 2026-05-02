import type { HookSpec } from '@vitamin/hooks'
import { defineHook } from '@vitamin/hooks'
import { appendPromptSection } from '@vitamin/prompt'
import type { SkillProvider } from '@vitamin/skill'

export function createSkillCatalogHook(provider: SkillProvider): HookSpec {
  return defineHook({
    name: 'skill-catalog-injection',
    timing: 'system-prompt.sections.transform',
    priority: 23,
    handle: async (_input, output) => {
      const catalog = await provider.catalog?.()
      if (!catalog) return

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

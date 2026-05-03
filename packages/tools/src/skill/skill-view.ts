import { z } from 'zod'

import type { AgentTool, ToolResult } from '@x-mars/agent'

const SkillViewArgsSchema = z.object({
  name: z.string().describe('The name of the Skill to view'),
  filePath: z
    .string()
    .optional()
    .describe('Optional linked file path, relative to the skill directory'),
})

type SkillViewArgs = z.infer<typeof SkillViewArgsSchema>

export type ViewSkill = (input: { name: string; filePath?: string }) => Promise<{
  success: boolean
  name?: string
  source?: { type: string; root?: string }
  path?: string
  content?: string
  supportingFiles?: string[]
  error?: string
}>

export function createSkillView(view?: ViewSkill): AgentTool<SkillViewArgs> {
  return {
    name: 'skill_view',
    description:
      'View a Skill body or one linked file from a Skill directory. Use this after skill_search when you need the full instructions or a specific reference/template file.',
    parameters: SkillViewArgsSchema,
    visibility: 'always',
    readonly: true,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,

    async execute({ params }): Promise<ToolResult> {
      if (!view) {
        return {
          content: [{ type: 'text', text: 'Skill view is not configured.' }],
          isError: true,
        }
      }

      const result = await view({ name: params.name, filePath: params.filePath })
      if (!result.success) {
        return {
          content: [{ type: 'text', text: `Failed to view skill: ${result.error}` }],
          isError: true,
        }
      }

      const header = [
        `Skill: ${result.name ?? params.name}`,
        result.source?.type ? `Source: ${result.source.type}` : undefined,
        result.path ? `Path: ${result.path}` : undefined,
        result.supportingFiles?.length
          ? `Linked files: ${result.supportingFiles.join(', ')}`
          : undefined,
      ]
        .filter(Boolean)
        .join('\n')

      return {
        content: [{ type: 'text', text: `${header}\n\n${result.content ?? ''}`.trim() }],
        details: {
          name: result.name ?? params.name,
          source: result.source,
          path: result.path,
          supportingFiles: result.supportingFiles,
        },
      }
    },
  }
}

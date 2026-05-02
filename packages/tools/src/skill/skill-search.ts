import { z } from 'zod'
import type { AgentTool, ToolResult } from '@x-mars/agent'

const SkillSearchArgsSchema = z.object({
  query: z.string().describe('Search query for matching skills'),
  maxResults: z.number().int().min(1).max(20).optional(),
})

type SkillSearchArgs = z.infer<typeof SkillSearchArgsSchema>

export interface SkillSearchEntry {
  name: string
  description: string
  trigger?: 'auto' | 'manual'
  relevance?: number
  matchedKeywords?: string[]
}

export type SearchSkills = (
  query: string,
  options?: { maxResults?: number },
) => Promise<SkillSearchEntry[]>

export function createSkillSearch(search?: SearchSkills): AgentTool<SkillSearchArgs> {
  return {
    name: 'skill_search',
    description: 'Search available Skills by name, description, and trigger metadata.',
    parameters: SkillSearchArgsSchema,
    visibility: 'always',
    readonly: true,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,

    async execute({ params }): Promise<ToolResult> {
      if (!search) {
        return {
          content: [{ type: 'text', text: 'Skill search is not configured.' }],
          isError: true,
        }
      }

      const results = await search(params.query, { maxResults: params.maxResults })
      if (results.length === 0) {
        return { content: [{ type: 'text', text: 'No matching skills found.' }] }
      }

      return {
        content: [
          {
            type: 'text',
            text: results
              .map((skill) =>
                [
                  `- ${skill.name}${skill.trigger === 'manual' ? ' [manual]' : ''}: ${skill.description}`,
                  skill.relevance !== undefined
                    ? `  relevance: ${skill.relevance.toFixed(2)}`
                    : undefined,
                  skill.matchedKeywords?.length
                    ? `  matched: ${skill.matchedKeywords.join(', ')}`
                    : undefined,
                ]
                  .filter(Boolean)
                  .join('\n'),
              )
              .join('\n'),
          },
        ],
      }
    },
  }
}

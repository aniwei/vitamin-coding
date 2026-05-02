import { z } from 'zod'
import type { AgentTool, ToolResult } from '@x-mars/agent'

const SkillCreateArgsSchema = z.object({
  name: z.string().describe('Skill name in kebab-case'),
  description: z.string().describe('Trigger-focused skill description'),
  body: z.string().describe('SKILL.md body content'),
  tags: z.array(z.string()).optional(),
  trigger: z.enum(['auto', 'manual']).optional(),
  overwrite: z.boolean().optional(),
})

type SkillCreateArgs = z.infer<typeof SkillCreateArgsSchema>

export type CreateSkill = (input: SkillCreateArgs) => Promise<{
  success: boolean
  name?: string
  path?: string
  error?: string
}>

export function createSkillCreate(create?: CreateSkill): AgentTool<SkillCreateArgs> {
  return {
    name: 'skill_create',
    description: 'Create a project Skill by writing a valid SKILL.md file.',
    parameters: SkillCreateArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!create) {
        return {
          content: [{ type: 'text', text: 'Skill creation is not configured.' }],
          isError: true,
        }
      }

      const result = await create(params)
      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Skill "${result.name ?? params.name}" created at ${result.path}`,
            },
          ],
        }
      }

      return {
        content: [{ type: 'text', text: `Failed to create skill: ${result.error}` }],
        isError: true,
      }
    },
  }
}

import { z } from 'zod'
import type { AgentTool, ToolResult } from '@x-mars/agent'

const SkillImproveArgsSchema = z.object({
  name: z.string().describe('Existing Skill name'),
  instructions: z.string().describe('Improvement note or implementation instruction to record'),
})

type SkillImproveArgs = z.infer<typeof SkillImproveArgsSchema>

export type ImproveSkill = (input: SkillImproveArgs) => Promise<{
  success: boolean
  name?: string
  path?: string
  error?: string
}>

export function createSkillImprove(improve?: ImproveSkill): AgentTool<SkillImproveArgs> {
  return {
    name: 'skill_improve',
    description: 'Improve an existing Skill while preserving its original content and change log.',
    parameters: SkillImproveArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!improve) {
        return {
          content: [{ type: 'text', text: 'Skill improvement is not configured.' }],
          isError: true,
        }
      }

      const result = await improve(params)
      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Skill "${result.name ?? params.name}" improved at ${result.path}`,
            },
          ],
        }
      }

      return {
        content: [{ type: 'text', text: `Failed to improve skill: ${result.error}` }],
        isError: true,
      }
    },
  }
}

import { z } from 'zod'

import type { AgentTool, ToolResult } from '@x-mars/agent'

const SkillExecutorArgsSchema = z.object({
  name: z.string().describe('The name of the Skill to execute'),
  input: z.string().optional().describe('The input to pass to the Skill'),
  parameters: z
    .record(z.string(), z.string())
    .optional()
    .describe('The parameters for the Skill (key-value pairs)'),
})

type SkillExecutorArgs = z.infer<typeof SkillExecutorArgsSchema>

export type ExecuteSkill = (
  name: string,
  input?: string,
  parameters?: Record<string, string>,
) => Promise<{
  success: boolean
  output?: string
  error?: string
}>

export function createSkillExecute(
  _projectRoot: string,
  execute?: ExecuteSkill,
): AgentTool<SkillExecutorArgs> {
  return {
    name: 'skill_execute',
    description: 'Execute a loaded Skill. A Skill is a reusable workflow template.',
    parameters: SkillExecutorArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!execute) {
        throw new Error('Execute function not provided')
      }

      const result = await execute(params.name, params.input, params.parameters)
      if (result.success) {
        return { content: [{ type: 'text', text: result.output ?? 'Skill executed successfully' }] }
      }

      return {
        content: [{ type: 'text', text: `Skill failed: ${result.error}` }],
        isError: true,
      }
    },
  }
}

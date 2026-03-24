import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const SkillExecutorArgsSchema = z.object({
  name: z.string().describe('The name of the Skill to execute'),
  input: z.string().optional().describe('The input to pass to the Skill'),
  parameters: z.record(z.string(), z.string()).optional().describe('The parameters for the Skill (key-value pairs)'),
})

type SkillExecutorArgs = z.infer<typeof SkillExecutorArgsSchema>

export type ExecuteSkill = (
  name: string, 
  input?: string, 
  params?: Record<string, string>
) => Promise<{
  success: boolean
  output?: string
  error?: string
}>

export function createSkillExecute(
  _projectRoot: string,
  execute?: ExecuteSkill
): AgentTool<SkillExecutorArgs> {
  return {
    name: 'skill_execute',
    description: 'Execute a loaded Skill. A Skill is a reusable workflow template.',
    parameters: SkillExecutorArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!execute) {
        throw new Error('Execute function not provided')
      }

      const result = await execute(args.name, args.input, args.parameters)
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

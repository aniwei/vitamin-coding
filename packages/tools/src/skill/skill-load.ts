import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const SkillLoaderArgsSchema = z.object({
  path: z.string().describe('SKILL.md file path, relative to project root'),
})

type SkillLoaderArgs = z.infer<typeof SkillLoaderArgsSchema>

export type LoadSkill = (path: string) => Promise<{
  success: boolean
  name?: string
  error?: string
}>

export function createSkillLoad(
  _projectRoot: string, 
  load: LoadSkill
): AgentTool<SkillLoaderArgs> {
  return {
    name: 'skill_load',
    description: 'Load Skill definitions from a SKILL.md file. After loading, the skills can be executed via skill-executor.',
    parameters: SkillLoaderArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!load) {
        throw new Error('Load function not provided')
      }

      const result = await load(args.path)
      if (result.success) {
        return { content: [{ type: 'text', text: `Skill "${result.name}" loaded from ${args.path}` }] }
      }

      return {
        content: [{ type: 'text', text: `Failed to load skill: ${result.error}` }],
        isError: true,
      }
    },
  }
}

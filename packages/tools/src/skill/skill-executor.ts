// skill-executor 工具 — 执行 Skill
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const SkillExecutorArgsSchema = z.object({
  skillName: z.string().describe('要执行的 Skill 名称'),
  input: z.string().optional().describe('传递给 Skill 的输入'),
  parameters: z.record(z.string(), z.string()).optional().describe('Skill 参数（键值对）'),
})

type SkillExecutorArgs = z.infer<typeof SkillExecutorArgsSchema>

export type ExecuteSkill = (name: string, input?: string, params?: Record<string, string>) => Promise<{
  success: boolean
  output?: string
  error?: string
}>

export function createSkillExecutorTool(executeFn?: ExecuteSkill): AgentTool<SkillExecutorArgs> {
  return {
    name: 'skill-executor',
    description: '执行已加载的 Skill。Skill 是可复用的工作流模版。',
    parameters: SkillExecutorArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!executeFn) {
        return {
          content: [{ type: 'text', text: 'skill-executor not available: skill system not initialized' }],
          isError: true,
        }
      }

      const result = await executeFn(args.skillName, args.input, args.parameters)
      return {
        content: [{ type: 'text', text: result.success ? (result.output ?? 'Skill completed') : `Skill failed: ${result.error}` }],
        isError: !result.success,
      }
    },
  }
}

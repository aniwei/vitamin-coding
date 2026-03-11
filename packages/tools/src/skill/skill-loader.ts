// skill-loader 工具 — 从 SKILL.md 加载 Skill
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const SkillLoaderArgsSchema = z.object({
  path: z.string().describe('SKILL.md 文件路径（相对或绝对）'),
})

type SkillLoaderArgs = z.infer<typeof SkillLoaderArgsSchema>

export type LoadSkill = (path: string) => Promise<{
  success: boolean
  skillName?: string
  error?: string
}>

export function createSkillLoaderTool(loadFn?: LoadSkill): AgentTool<SkillLoaderArgs> {
  return {
    name: 'skill-loader',
    description: '从 SKILL.md 文件加载 Skill 定义。加载后可通过 skill-executor 执行。',
    parameters: SkillLoaderArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!loadFn) {
        return {
          content: [{ type: 'text', text: 'skill-loader not available' }],
          isError: true,
        }
      }

      const result = await loadFn(args.path)
      if (result.success) {
        return { content: [{ type: 'text', text: `Skill "${result.skillName}" loaded from ${args.path}` }] }
      }

      return {
        content: [{ type: 'text', text: `Failed to load skill: ${result.error}` }],
        isError: true,
      }
    },
  }
}

// skill-loader 工具 — 从 SKILL.md 加载 Skill
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'
import type { RegisterSkillOptions } from '../types'

const SkillLoaderArgsSchema = z.object({
  path: z.string().describe('SKILL.md 文件路径（相对或绝对）'),
})

type SkillLoaderArgs = z.infer<typeof SkillLoaderArgsSchema>

export function createSkillLoader(options: RegisterSkillOptions): AgentTool<SkillLoaderArgs> {
  const { loader } = options
  
  return {
    name: 'skill_loader',
    description: '从 SKILL.md 文件加载 Skill 定义。加载后可通过 skill-executor 执行。',
    parameters: SkillLoaderArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!loader) {
        return {
          content: [{ type: 'text', text: 'skill-loader not available' }],
          isError: true,
        }
      }

      const result = await loader(args.path)
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

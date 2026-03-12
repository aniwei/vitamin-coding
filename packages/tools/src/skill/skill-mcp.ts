// skill-mcp 工具 — Skill 内嵌 MCP 调用
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'
import type { RegisterSkillOptions } from '../types'

const SkillMcpArgsSchema = z.object({
  server: z.string().describe('MCP 服务器名称（Skill 定义中声明的）'),
  tool: z.string().describe('MCP 工具名称'),
  arguments: z.record(z.string(), z.unknown()).optional().describe('MCP 工具参数'),
})

type SkillMcpArgs = z.infer<typeof SkillMcpArgsSchema>


export function createSkillMcp(options: RegisterSkillOptions): AgentTool<SkillMcpArgs> {
  const { mcp } = options
  return {
    name: 'skill_mcp',
    description: '调用 Skill 定义中声明的 MCP 服务器工具。',
    parameters: SkillMcpArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!mcp) {
        return {
          content: [{ type: 'text', text: 'skill-mcp not available: MCP system not initialized' }],
          isError: true,
        }
      }

      const result = await mcp(
        args.server, 
        args.tool, 
        args.arguments
      )

      if (result.success) {
        const text = typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result, null, 2)
        return { content: [{ type: 'text', text }] }
      }

      return {
        content: [{ type: 'text', text: `MCP call failed: ${result.error}` }],
        isError: true,
      }
    },
  }
}

// skill-mcp 工具 — Skill 内嵌 MCP 调用
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const SkillMcpArgsSchema = z.object({
  mcpServer: z.string().describe('MCP 服务器名称（Skill 定义中声明的）'),
  tool: z.string().describe('MCP 工具名称'),
  arguments: z.record(z.string(), z.unknown()).optional().describe('MCP 工具参数'),
})

type SkillMcpArgs = z.infer<typeof SkillMcpArgsSchema>

export type CallSkillMcp = (server: string, tool: string, args?: Record<string, unknown>) => Promise<{
  success: boolean
  result?: unknown
  error?: string
}>

export function createSkillMcpTool(callFn?: CallSkillMcp): AgentTool<SkillMcpArgs> {
  return {
    name: 'skill-mcp',
    description: '调用 Skill 定义中声明的 MCP 服务器工具。',
    parameters: SkillMcpArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!callFn) {
        return {
          content: [{ type: 'text', text: 'skill-mcp not available: MCP system not initialized' }],
          isError: true,
        }
      }

      const result = await callFn(args.mcpServer, args.tool, args.arguments)
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

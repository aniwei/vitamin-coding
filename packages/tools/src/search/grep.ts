import { z } from 'zod'
import type { AgentTool, ToolResult } from '@vitamin/agent'

const GrepArgsSchema = z.object({
  pattern: z.string().describe('搜索模式（正则表达式或纯文本）'),
  path: z.string().optional().describe('搜索路径（默认项目根目录）'),
  isRegex: z.boolean().optional().default(false).describe('是否为正则搜索'),
  caseSensitive: z.boolean().optional().default(false).describe('是否区分大小写'),
  maxResults: z.number().int().min(1).max(1000).optional().default(100).describe('最大结果数'),
  includePattern: z.string().optional().describe('文件包含 glob（如 "*.ts"）'),
})

type GrepArgs = z.infer<typeof GrepArgsSchema>


export function createGrep(_projectRoot: string): AgentTool<GrepArgs> {
  
  return {
    name: 'grep',
    description: 'Search for text or regex patterns in the project. Returns matching file names, line numbers, and content.',
    parameters: GrepArgsSchema,
    visibility: 'always',

    async execute(_ctx): Promise<ToolResult> {
      // TODO
      throw new Error('Grep tool is not implemented yet')
    },
  }
}

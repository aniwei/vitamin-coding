import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const FindArgsSchema = z.object({
  pattern: z.string().describe('File name pattern with optional wildcards (*, ?), e.g. "*.ts", "data-??.json"'),
  path: z.string().optional().describe('Search starting path (default is project root)'),
  limit: z.number().int().min(1).max(500).optional().default(100).describe('Maximum number of results to return'),
})

type FindArgs = z.infer<typeof FindArgsSchema>


interface FindToolOptions {
  excluded: string[]
}

export function createFind(
  projectRoot: string,
  options: FindToolOptions = {
    excluded: ['node_modules', 'dist', 'build', '.git', '.cache'], // 默认排除常见的构建输出和依赖目录
  }
): AgentTool<FindArgs> {
  const excluded = options.excluded
  
  return {
    name: 'find',
    description: '在项目中查找文件或目录。可按名称、类型过滤。',
    parameters: FindArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      
    },
  }
}

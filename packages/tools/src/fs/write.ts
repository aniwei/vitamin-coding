// write 工具 — 创建或覆盖文件
import { dirname } from 'node:path'
import { mkdirp, writeText } from '@vitamin/shared'
import { normalizePath, resolvePath } from '@vitamin/shared'
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

// 参数 schema
const WriteArgsSchema = z.object({
  path: z.string().describe('要写入的文件路径（相对于项目根目录或绝对路径）'),
  content: z.string().describe('文件内容'),
  createDirectories: z.boolean().optional().default(true).describe('是否自动创建父目录'),
})

type WriteArgs = z.infer<typeof WriteArgsSchema>

export interface WriteOptions {
  
}

// 创建 write 工具
export function createWrite(projectRoot: string, _options: WriteOptions): AgentTool<WriteArgs> {
  return {
    name: 'write',
    description: '创建或覆盖文件，自动创建不存在的父目录',
    parameters: WriteArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      const resolvedPath = resolvePath(projectRoot, args.path)
      const normalizedPath = normalizePath(resolvedPath)

      try {
        // 创建父目录
        if (args.createDirectories !== false) {
          await mkdirp(dirname(normalizedPath))
        }

        await writeText(normalizedPath, args.content)

        const lineCount = args.content.split('\n').length
        return {
          content: [{ type: 'text', text: `Successfully wrote ${lineCount} lines to ${args.path}`, }],
          metadata: {
            path: normalizedPath,
            lineCount,
            byteSize: Buffer.byteLength(args.content, 'utf-8'),
          },
        }
      } catch (error) {
        const message = error instanceof Error 
          ? error.message 
          : String(error)

        return {
          content: [{ type: 'text', text: `Failed to write file: ${message}` }],
          isError: true,
        }
      }
    },
  }
}

import { dirname } from 'node:path'
import { mkdirp, normalizePath } from '@vitamin/shared'
import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

// 参数 schema
const WriteArgsSchema = z.object({
  path: z.string().describe('Path to the file to write (relative or absolute)'),
  content: z.string().describe('Content to write to the file'),
  createDirectories: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to create parent directories if they do not exist'),
})

export type WriteArgs = z.infer<typeof WriteArgsSchema>

// 创建 write 工具
export function createWrite(projectRoot: string): AgentTool<WriteArgs> {
  return {
    name: 'write',
    description:
      'Create or overwrite a file, automatically creating parent directories if they do not exist',
    parameters: WriteArgsSchema,
    visibility: 'always',

    async execute({ params, signal }): Promise<ToolResult> {
      const resolvedPath = resolve(projectRoot, params.path)
      const normalizedPath = normalizePath(resolvedPath)

      if (params.createDirectories !== false) {
        await mkdirp(dirname(normalizedPath))
      }

      if (signal.aborted) {
        throw new Error('Write operation was aborted')
      }

      return await write(normalizedPath, params.content, signal)
    },
  }
}

async function write(path: string, content: string, signal: AbortSignal): Promise<ToolResult> {
  if (signal.aborted) {
    throw new Error('Write operation was aborted')
  }

  await writeFile(path, content, 'utf-8')

  return {
    content: [{ type: 'text', text: `Successfully wrote to ${path}` }],
  }
}

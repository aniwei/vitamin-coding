import { z } from 'zod'
import { 
  isFile, 
  exists,
  normalizePath
} from '@vitamin/shared'
import { resolve } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'

import type { AgentTool, ToolResult } from '@vitamin/agent'

// 参数 schema
const EditArgsSchema = z.object({
  path: z.string().describe('Path to the file to edit (relative or absolute)'),
  oldContent: z.string().describe('Exact string to be replaced (must match uniquely)'),
  content: z.string().describe('Replacement string'),
  replaceAll: z.boolean().optional().default(false).describe('Whether to replace all occurrences of oldContent'),
})

export type EditArgs = z.infer<typeof EditArgsSchema>

// 创建 edit 工具
export function createEdit(projectRoot: string): AgentTool<EditArgs> {
  return {
    name: 'edit',
    description: 'Exact string replacement edit. oldString must match uniquely.',
    parameters: EditArgsSchema,
    visibility: 'always',

    async execute({ args }): Promise<ToolResult> {
      const resolvedPath = resolve(projectRoot, args.path)
      const normalizedPath = normalizePath(resolvedPath)

      if (!await exists(normalizedPath)) {
        throw new Error(`File not found: ${args.path}`)
      }

      if (!await isFile(normalizedPath)) {
        throw new Error(`Not a file: ${args.path}`)
      }

      const content = await readFile(normalizedPath, 'utf-8')
      if (content === undefined) {
        throw new Error(`Failed to read file: ${args.path}`)
      }

      const occurrences = content.split(args.oldContent).length - 1
      if (occurrences === 0) {
        throw new Error(`oldContent not found in ${args.path}`)
      }
      if (!args.replaceAll && occurrences > 1) {
        throw new Error(`oldContent appears ${occurrences} times in ${args.path}. Use replaceAll or provide more context for a unique match.`)
      }

      const newContent = args.replaceAll
        ? content.replaceAll(args.oldContent, args.content)
        : content.replace(args.oldContent, args.content)

      await writeFile(normalizedPath, newContent, 'utf-8')

      return {
        content: [{
          type: 'text',
          text: `Edited ${args.path}: replaced ${occurrences} occurrence(s)`,
        }],
      }
    },
  }
}

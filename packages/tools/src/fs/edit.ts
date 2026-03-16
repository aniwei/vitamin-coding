import { z } from 'zod'
import { isFile, exists, readText, writeText } from '@vitamin/shared'
import { normalizePath, resolvePath } from '@vitamin/shared'

import type { AgentTool, ToolResult } from '@vitamin/agent'

// 参数 schema
const EditArgsSchema = z.object({
  path: z.string().describe('Path to the file to edit (relative or absolute)'),
  oldContent: z.string().describe('Exact string to be replaced (must match uniquely)'),
  content: z.string().describe('Replacement string'),
})

export type EditArgs = z.infer<typeof EditArgsSchema>


// 创建 edit 工具
// TODO
export function createEdit(projectRoot: string): AgentTool<EditArgs> {
  return {
    name: 'edit',
    description: 'Exact string replacement edit. oldString must match uniquely.',
    parameters: EditArgsSchema,
    visibility: 'always',

    async execute(_id, args, signal): Promise<ToolResult> {
      const resolvedPath = resolvePath(projectRoot, args.path)
      const normalizedPath = normalizePath(resolvedPath)

      // 检查文件存在
      if (!await exists(normalizedPath)) {
        throw new Error(`File not found: ${args.path}`)
      }

      if (!await isFile(normalizedPath)) {
        throw new Error(`Not a file: ${args.path}`)
      }

      const content = await readText(normalizedPath)
      if (content === undefined) {
        throw new Error(`Failed to read file: ${args.path}`)
      }

      // 检查匹配次数
      const matchCount = countOccurrences(content, args.oldContent)

      if (matchCount === 0) {
        throw new Error(`oldString not found in file: ${args.path}`)
      }

      if (matchCount > 1) {
        throw new Error(`oldString found ${matchCount} times in ${args.path}. It must match exactly once. Include more context to make it unique.`)
      }

      // 执行替换
      const newContent = content.replace(args.oldContent, args.content)
      await writeText(normalizedPath, newContent)

      // 生成简要 diff 信息
      const oldLines = args.oldContent.split('\n').length
      const newLines = args.content.split('\n').length

      return {
        content: [{ type: 'text', text: `Successfully edited ${args.path}: replaced ${oldLines} lines with ${newLines} lines` }],
        details: {
          path: normalizedPath,
          oldLines,
          newLines,
        },
      }
    },
  }
}

// 统计子串出现次数
function countOccurrences(text: string, substring: string): number {
  if (substring.length === 0) return 0
  let count = 0
  let position = 0
  while (true) {
    position = text.indexOf(substring, position)
    if (position === -1) break
    count++
    position += 1
  }
  return count
}

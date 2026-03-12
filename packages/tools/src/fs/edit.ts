import { isFile, exists, readText, writeText } from '@vitamin/shared'
import { normalizePath, resolvePath } from '@vitamin/shared'
// edit 工具 — 精确字符串替换编辑
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

// 参数 schema
const EditArgsSchema = z.object({
  path: z.string().describe('要编辑的文件路径'),
  oldString: z.string().describe('要替换的精确原文（必须唯一匹配）'),
  newString: z.string().describe('替换后的文本'),
})

type EditArgs = z.infer<typeof EditArgsSchema>

export interface EditOptions {
}

// 创建 edit 工具
export function createEdit(projectRoot: string, _options: EditOptions): AgentTool<EditArgs> {
  

  return {
    name: 'edit',
    description: '精确字符串替换编辑。oldString 必须在文件中唯一匹配。',
    parameters: EditArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      const resolvedPath = resolvePath(projectRoot, args.path)
      const normalizedPath = normalizePath(resolvedPath)

      // 检查文件存在
      if (!(await exists(normalizedPath))) {
        return {
          content: [{ type: 'text', text: `File not found: ${args.path}` }],
          isError: true,
        }
      }

      if (!(await isFile(normalizedPath))) {
        return {
          content: [{ type: 'text', text: `Not a file: ${args.path}` }],
          isError: true,
        }
      }

      try {
        const content = await readText(normalizedPath)
        if (content === undefined) {
          return {
            content: [{ type: 'text', text: `Failed to read file: ${args.path}` }],
            isError: true,
          }
        }

        // 检查匹配次数
        const matchCount = countOccurrences(content, args.oldString)

        if (matchCount === 0) {
          return {
            content: [{ type: 'text', text: `Old string not found in ${args.path}. Make sure the string matches exactly including whitespace and indentation.`}],
            isError: true,
          }
        }

        if (matchCount > 1) {
          return {
            content: [{ type: 'text', text: `oldString found ${matchCount} times in ${args.path}. It must match exactly once. Include more context to make it unique.` }],
            isError: true,
          }
        }

        // 执行替换
        const newContent = content.replace(args.oldString, args.newString)
        await writeText(normalizedPath, newContent)

        // 生成简要 diff 信息
        const oldLines = args.oldString.split('\n').length
        const newLines = args.newString.split('\n').length

        return {
          content: [{ type: 'text', text: `Successfully edited ${args.path}: replaced ${oldLines} lines with ${newLines} lines` }],
          metadata: {
            path: normalizedPath,
            oldLines,
            newLines,
          },
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: [{ type: 'text', text: `Failed to edit file: ${message}` }],
          isError: true,
        }
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

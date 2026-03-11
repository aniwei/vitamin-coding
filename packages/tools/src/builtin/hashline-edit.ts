// hashline-edit 工具 — 基于行号哈希的精确定位编辑
import { z } from 'zod'
import { createHash } from 'node:crypto'

import type { AgentTool, ToolResult } from '@vitamin/agent'
import { readText, writeText, resolvePath, normalizePath, exists } from '@vitamin/shared'

const HashlineEditArgsSchema = z.object({
  path: z.string().describe('要编辑的文件路径'),
  lineHash: z.string().describe('目标行内容的 SHA-256 哈希前缀（8 位）'),
  lineNumber: z.number().int().min(1).describe('目标行号（1-based）'),
  newContent: z.string().describe('替换后的新行内容'),
})

type HashlineEditArgs = z.infer<typeof HashlineEditArgsSchema>

export function createHashlineEditTool(projectRoot: string): AgentTool<HashlineEditArgs> {
  return {
    name: 'hashline-edit',
    description: '基于行号 + 行哈希的精确编辑。先用 read 工具查看行内容，取其 SHA-256 前 8 位作为验证哈希。',
    parameters: HashlineEditArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      const resolved = normalizePath(resolvePath(projectRoot, args.path))

      if (!(await exists(resolved))) {
        return { content: [{ type: 'text', text: `File not found: ${args.path}` }], isError: true }
      }

      const content = await readText(resolved)

      if (content === undefined) {
        return { content: [{ type: 'text', text: `Failed to read file: ${args.path}` }], isError: true }
      }

      const lines = content.split('\n')
      const lineIndex = args.lineNumber - 1

      if (lineIndex < 0 || lineIndex >= lines.length) {
        return {
          content: [{
            type: 'text',
            text: `Line ${args.lineNumber} out of range (file has ${lines.length} lines)`,
          }],
          isError: true,
        }
      }

      const currentLine = lines[lineIndex] ?? ''
      const currentHash = hashLine(currentLine)

      if (!currentHash.startsWith(args.lineHash)) {
        return {
          content: [{
            type: 'text',
            text: `Hash mismatch at line ${args.lineNumber}: expected ${args.lineHash}..., got ${currentHash.slice(0, 8)}... Content: "${currentLine.slice(0, 80)}"`,
          }],
          isError: true,
        }
      }

      lines[lineIndex] = args.newContent
      const updated = lines.join('\n')
      await writeText(resolved, updated)

      return {
        content: [{
          type: 'text',
          text: `Line ${args.lineNumber} updated in ${args.path}`,
        }],
      }
    },
  }
}

// 计算行的 SHA-256 哈希
export function hashLine(line: string): string {
  return createHash('sha256').update(line).digest('hex')
}

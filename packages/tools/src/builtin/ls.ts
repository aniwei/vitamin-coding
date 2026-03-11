// ls 工具 — 目录列表（递归可选）
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { exists } from '@vitamin/shared'
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const LsArgsSchema = z.object({
  path: z.string().optional().default('.').describe('要列出的目录路径（相对于项目根目录）'),
  recursive: z.boolean().optional().default(false).describe('是否递归列出子目录'),
  maxDepth: z.number().int().min(1).max(10).optional().default(3).describe('递归深度上限'),
  maxEntries: z.number().int().min(1).max(2000).optional().default(500).describe('最大条目数'),
})

type LsArgs = z.infer<typeof LsArgsSchema>

// 排除的目录
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '__pycache__', '.turbo'])

export function createLsTool(projectRoot: string): AgentTool<LsArgs> {
  return {
    name: 'ls',
    description: '列出目录内容。可递归显示子目录结构。',
    parameters: LsArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      const targetDir = join(projectRoot, args.path)

      if (!(await exists(targetDir))) {
        return {
          content: [{ type: 'text', text: `Directory not found: ${args.path}` }],
          isError: true,
        }
      }

      try {
        const lines: string[] = []
        await listDir(targetDir, 0, args.recursive ? args.maxDepth : 0, lines, args.maxEntries, projectRoot)

        if (lines.length === 0) {
          return {
            content: [{ type: 'text', text: `Empty directory: ${args.path}` }],
          }
        }

        const truncationNote = lines.length >= args.maxEntries
          ? `\n\n... [truncated at ${args.maxEntries} entries]`
          : ''

        return {
          content: [{ type: 'text', text: `Directory: ${args.path}\n${lines.join('\n')}${truncationNote}` }],
          metadata: { entryCount: lines.length, path: args.path },
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: [{ type: 'text', text: `ls failed: ${message}` }],
          isError: true,
        }
      }
    },
  }
}

async function listDir(
  dir: string,
  depth: number,
  maxDepth: number,
  lines: string[],
  maxEntries: number,
  projectRoot: string,
): Promise<void> {
  if (lines.length >= maxEntries) return

  const entries = await readdir(dir, { withFileTypes: true })
  // 目录在前，文件在后，分别按字母排序
  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name)
  })

  const indent = '  '.repeat(depth)
  for (const entry of sorted) {
    if (lines.length >= maxEntries) return

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      lines.push(`${indent}${entry.name}/`)
      if (depth < maxDepth) {
        await listDir(join(dir, entry.name), depth + 1, maxDepth, lines, maxEntries, projectRoot)
      }
    } else {
      lines.push(`${indent}${entry.name}`)
    }
  }
}

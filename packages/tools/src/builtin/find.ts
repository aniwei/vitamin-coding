// find 工具 — 按名称/类型/大小/修改时间查找文件
import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const FindArgsSchema = z.object({
  name: z.string().optional().describe('按文件名模式搜索（支持 * 通配符）'),
  type: z.enum(['file', 'directory', 'any']).optional().default('any').describe('仅搜索文件或目录'),
  path: z.string().optional().describe('搜索起始路径（默认项目根目录）'),
  maxDepth: z.number().int().min(1).max(20).optional().default(10).describe('最大递归深度'),
  maxResults: z.number().int().min(1).max(1000).optional().default(200).describe('最大结果数'),
})

type FindArgs = z.infer<typeof FindArgsSchema>

// 排除的目录
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '__pycache__', '.turbo'])

export function createFindTool(projectRoot: string): AgentTool<FindArgs> {
  return {
    name: 'find',
    description: '在项目中查找文件或目录。可按名称、类型过滤。',
    parameters: FindArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      const searchRoot = args.path ? join(projectRoot, args.path) : projectRoot
      const namePattern = args.name ? nameToRegex(args.name) : null
      const results: string[] = []

      try {
        await walkFind(searchRoot, 0, args.maxDepth, args.type, namePattern, results, args.maxResults, projectRoot)

        if (results.length === 0) {
          return {
            content: [{ type: 'text', text: `No matches found${args.name ? ` for name: ${args.name}` : ''}` }],
          }
        }

        const listing = results.sort().join('\n')
        return {
          content: [{ type: 'text', text: `Found ${results.length} entries:\n${listing}` }],
          metadata: { matchCount: results.length },
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: [{ type: 'text', text: `Find failed: ${message}` }],
          isError: true,
        }
      }
    },
  }
}

async function walkFind(
  dir: string,
  depth: number,
  maxDepth: number,
  type: 'file' | 'directory' | 'any',
  namePattern: RegExp | null,
  results: string[],
  maxResults: number,
  projectRoot: string,
): Promise<void> {
  if (depth > maxDepth || results.length >= maxResults) return

  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (results.length >= maxResults) return

    const isDir = entry.isDirectory()
    if (isDir && EXCLUDED_DIRS.has(entry.name)) continue

    // 类型过滤
    if (type === 'file' && isDir) {
      // 仍然递归进入目录，但不记录
    } else if (type === 'directory' && !isDir) {
      continue
    } else {
      // 名称匹配
      if (!namePattern || namePattern.test(entry.name)) {
        const relPath = relative(projectRoot, join(dir, entry.name))
        results.push(isDir ? `${relPath}/` : relPath)
      }
    }

    if (isDir) {
      await walkFind(join(dir, entry.name), depth + 1, maxDepth, type, namePattern, results, maxResults, projectRoot)
    }
  }
}

// 将 * 通配符转正则
function nameToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i')
}

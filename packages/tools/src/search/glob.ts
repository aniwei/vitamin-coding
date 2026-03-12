// glob 工具 — 文件名 glob 匹配
import { readdir, glob } from 'node:fs/promises'
import { join, relative } from 'node:path'

import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const GlobArgsSchema = z.object({
  pattern: z.string().describe('Glob 模式（如 "**/*.ts"、"src/**/*.test.ts"）'),
  path: z.string().optional().describe('搜索起始路径（默认项目根目录）'),
  maxResults: z.number().int().min(1).max(5000).optional().default(500).describe('最大结果数'),
})

type GlobArgs = z.infer<typeof GlobArgsSchema>

interface GlobOptions {
  projectRoot: string,
}

export function createGlob(options: GlobOptions): AgentTool<GlobArgs> {
  const { projectRoot } = options
  return {
    name: 'glob',
    description: '按 glob 模式搜索文件。返回匹配的文件路径列表。',
    parameters: GlobArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      const searchRoot = args.path ? join(projectRoot, args.path) : projectRoot

      try {
        const matches: string[] = []

        for await (const entry of glob(args.pattern, { cwd: searchRoot })) {
          if (matches.length >= args.maxResults) break
          matches.push(entry)
        }

        if (matches.length === 0) {
          return {
            content: [{ type: 'text', text: `No files match pattern: ${args.pattern}` }],
          }
        }

        const listing = matches.sort().join('\n')
        return {
          content: [{ type: 'text', text: `Found ${matches.length} files:\n${listing}` }],
          metadata: { matchCount: matches.length, pattern: args.pattern },
        }
      } catch (error) {
        // node:fs/promises glob 不可用时 fallback
        try {
          const matches = await walkGlob(searchRoot, args.pattern, args.maxResults, projectRoot)
          if (matches.length === 0) {
            return {
              content: [{ type: 'text', text: `No files match pattern: ${args.pattern}` }],
            }
          }
          const listing = matches.sort().join('\n')
          return {
            content: [{ type: 'text', text: `Found ${matches.length} files:\n${listing}` }],
            metadata: { matchCount: matches.length, pattern: args.pattern },
          }
        } catch (walkError) {
          const message = walkError instanceof Error ? walkError.message : String(walkError)
          return {
            content: [{ type: 'text', text: `Glob failed: ${message}` }],
            isError: true,
          }
        }
      }
    },
  }
}

// 排除的目录
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '__pycache__'])

// 简易 glob 匹配 fallback
async function walkGlob(
  dir: string,
  pattern: string,
  maxResults: number,
  projectRoot: string,
): Promise<string[]> {
  const results: string[] = []
  const regex = globToRegex(pattern)

  async function walk(currentDir: string): Promise<void> {
    if (results.length >= maxResults) return

    const entries = await readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      if (results.length >= maxResults) return

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue
        await walk(join(currentDir, entry.name))
      } else {
        const relPath = relative(projectRoot, join(currentDir, entry.name))
        if (regex.test(relPath)) {
          results.push(relPath)
        }
      }
    }
  }

  await walk(dir)
  return results
}

// 将 glob 模式转换为正则
function globToRegex(pattern: string): RegExp {
  let regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '§DOUBLESTAR§')
    .replace(/\*/g, '[^/]*')
    .replace(/§DOUBLESTAR§/g, '.*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${regex}$`)
}

// glob 工具 — 文件名 glob 匹配
import { readdir, glob } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { exists, truncateHead, formatBytes } from '@vitamin/shared'
import { TOOLS_SEARCH_MAX_OUTPUT_LINES, TOOLS_MAX_OUTPUT_BYTES } from '@vitamin/env'

import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const GlobArgsSchema = z.object({
  pattern: z.string().describe('Glob pattern (e.g. "**/*.ts", "src/**/*.test.ts")'),
  path: z.string().optional().describe('Search starting path (default is project root)'),
  limit: z.number().int().min(1).max(500).optional().default(500).describe('Maximum number of results'),
})

type GlobArgs = z.infer<typeof GlobArgsSchema>

interface GlobToolOptions {
  exclude?: string[] // 额外的排除模式
}

export function createGlob(
  projectRoot: string, 
  options: GlobToolOptions
): AgentTool<GlobArgs> {
  const exclude = options.exclude ?? []

  return {
    name: 'glob',
    description: 'Search for files matching a glob pattern. Returns a list of matching file paths.',
    parameters: GlobArgsSchema,
    visibility: 'always',

    async execute({ args, signal }): Promise<ToolResult> {
      const searchDir = args.path 
        ? join(projectRoot, args.path) 
        : projectRoot

      if (!await exists(searchDir)) {
        throw new Error(`Search path does not exist: ${searchDir}`)
      }

      const limit = args.limit ?? TOOLS_SEARCH_MAX_OUTPUT_LINES

      const results = await Array.fromAsync(glob(args.pattern, {
        cwd: searchDir,
        exclude,
      }))

      if (signal.aborted) {
        throw new Error('Search operation was aborted')
      }

      if (results.length === 0) {
        return {
          content: [{ type: 'text', text: 'No files found matching pattern' }],
        }
      }

      const relativized = results.map((p) => {
        return p.startsWith(searchDir) 
          ? p.slice(searchDir.length + 1) 
          : relative(searchDir, p)
      })

      const limitReached = relativized.length >= limit
      const rawOutput = relativized.join('\n')
      const truncation = truncateHead(rawOutput, { 
        maxLines: Number.MAX_SAFE_INTEGER,
        maxBytes: TOOLS_MAX_OUTPUT_BYTES
      })

      let output = truncation.content
      const notices: string[] = []

      if (limitReached) {
        notices.push(`${limit} results limit reached`)
      }

      if (truncation.truncated) {
        notices.push(`${formatBytes(TOOLS_MAX_OUTPUT_BYTES)} limit reached`)
      }

      if (notices.length > 0) {
        output += `\n\n(${notices.join(". ")})`
      }

      return {
        content: [{ type: 'text', text: output }],
        details: {
          limitReached,
          truncation,
        }
      }
    }
  }
}

// 排除的目录
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '__pycache__'])

// 简易 glob 匹配 fallback
async function _walkGlob(
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

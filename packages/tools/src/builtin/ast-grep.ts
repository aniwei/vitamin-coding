// ast-grep 工具 — AST 结构化搜索
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const execFileAsync = promisify(execFile)

const AstGrepArgsSchema = z.object({
  pattern: z.string().describe('AST 搜索模式（如 "function $NAME($$$) { $$$ }"）'),
  lang: z.enum(['typescript', 'javascript', 'tsx', 'jsx', 'python', 'rust', 'go', 'css', 'html'])
    .optional().default('typescript')
    .describe('目标语言'),
  path: z.string().optional().describe('搜索路径（默认项目根目录）'),
  maxResults: z.number().int().min(1).max(200).optional().default(50).describe('最大结果数'),
})

type AstGrepArgs = z.infer<typeof AstGrepArgsSchema>

const MAX_OUTPUT_SIZE = 60 * 1024

export function createAstGrepTool(projectRoot: string): AgentTool<AstGrepArgs> {
  return {
    name: 'ast-grep',
    description: '使用 AST 模式搜索代码结构。比正则更精确地匹配代码模式。',
    parameters: AstGrepArgsSchema,
    visibility: 'always',

    async execute(_id, args, signal): Promise<ToolResult> {
      const searchPath = args.path ?? '.'

      try {
        // 尝试使用 sg (ast-grep CLI)
        const sgArgs = [
          'run',
          '--pattern', args.pattern,
          '--lang', args.lang,
          '--json',
          searchPath,
        ]

        const { stdout } = await execFileAsync('sg', sgArgs, {
          cwd: projectRoot,
          maxBuffer: MAX_OUTPUT_SIZE * 2,
          timeout: 30_000,
          signal,
        })

        const results = parseAstGrepOutput(stdout, args.maxResults)
        if (results.length === 0) {
          return {
            content: [{ type: 'text', text: `No AST matches found for pattern: ${args.pattern}` }],
          }
        }

        const formatted = formatAstGrepResults(results)
        return {
          content: [{ type: 'text', text: formatted }],
          metadata: { matchCount: results.length },
        }
      } catch (error) {
        const err = error as { code?: string; message?: string }

        // sg 命令不可用时，提供友好提示
        if (err.code === 'ENOENT') {
          return {
            content: [{
              type: 'text',
              text: 'ast-grep (sg) is not installed. Install it with: npm install -g @ast-grep/cli',
            }],
            isError: true,
          }
        }

        return {
          content: [{ type: 'text', text: `AST grep failed: ${err.message ?? 'Unknown error'}` }],
          isError: true,
        }
      }
    },
  }
}

interface AstGrepMatch {
  file: string
  range: { start: { line: number; column: number }; end: { line: number; column: number } }
  text: string
}

function parseAstGrepOutput(stdout: string, maxResults: number): AstGrepMatch[] {
  try {
    const parsed = JSON.parse(stdout)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, maxResults).map((match: Record<string, unknown>) => ({
      file: String(match.file ?? ''),
      range: match.range as AstGrepMatch['range'],
      text: String(match.text ?? ''),
    }))
  } catch {
    return []
  }
}

function formatAstGrepResults(results: AstGrepMatch[]): string {
  const lines: string[] = [`Found ${results.length} AST matches:\n`]

  for (const match of results) {
    const startLine = match.range?.start?.line ?? 0
    lines.push(`${match.file}:${startLine}`)
    lines.push(`  ${match.text.split('\n')[0] ?? ''}`)
    lines.push('')
  }

  return lines.join('\n')
}

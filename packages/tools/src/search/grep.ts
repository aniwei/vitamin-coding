// grep 工具 — 正则/文本搜索（ripgrep 风格）
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const execFileAsync = promisify(execFile)

const GrepArgsSchema = z.object({
  pattern: z.string().describe('搜索模式（正则表达式或纯文本）'),
  path: z.string().optional().describe('搜索路径（默认项目根目录）'),
  isRegex: z.boolean().optional().default(false).describe('是否为正则搜索'),
  caseSensitive: z.boolean().optional().default(false).describe('是否区分大小写'),
  maxResults: z.number().int().min(1).max(1000).optional().default(100).describe('最大结果数'),
  includePattern: z.string().optional().describe('文件包含 glob（如 "*.ts"）'),
})

type GrepArgs = z.infer<typeof GrepArgsSchema>

// 输出大小上限 60KB
const MAX_OUTPUT_SIZE = 60 * 1024

interface GrepOptions {
  projectRoot: string,
  maxOutputSize?: number,
}

export function createGrep(options: GrepOptions): AgentTool<GrepArgs> {
  const { projectRoot, maxOutputSize = MAX_OUTPUT_SIZE } = options
  return {
    name: 'grep',
    description: '在项目中搜索文本或正则模式。返回匹配的文件名、行号和内容。',
    parameters: GrepArgsSchema,
    visibility: 'always',

    async execute(_id, args, signal): Promise<ToolResult> {
      const searchPath = args.path ?? projectRoot
      const grepArgs = buildGrepArgs(args, searchPath)

      try {
        const { stdout } = await execFileAsync('grep', grepArgs, {
          cwd: projectRoot,
          maxBuffer: maxOutputSize * 2,
          timeout: 30_000,
          signal,
        })

        const trimmed = truncateOutput(stdout, maxOutputSize)
        if (!trimmed) {
          return {
            content: [{ type: 'text', text: `No matches found for pattern: ${args.pattern}` }],
          }
        }

        return {
          content: [{ type: 'text', text: trimmed }],
          metadata: { matchCount: trimmed.split('\n').length },
        }
      } catch (error) {
        const err = error as { code?: number; stdout?: string; message?: string }
        // grep exit code 1 = no matches
        if (err.code === 1) {
          return {
            content: [{ type: 'text', text: `No matches found for pattern: ${args.pattern}` }],
          }
        }
        return {
          content: [{ type: 'text', text: `Grep failed: ${err.message ?? 'Unknown error'}` }],
          isError: true,
        }
      }
    },
  }
}

function buildGrepArgs(args: GrepArgs, searchPath: string): string[] {
  const grepArgs: string[] = ['-rn'] // 递归 + 行号

  if (!args.caseSensitive) grepArgs.push('-i')
  if (!args.isRegex) grepArgs.push('-F') // 固定字符串模式
  if (args.maxResults) grepArgs.push('-m', String(args.maxResults))
  if (args.includePattern) grepArgs.push(`--include=${args.includePattern}`)

  // 排除常见大目录
  grepArgs.push('--exclude-dir=node_modules')
  grepArgs.push('--exclude-dir=.git')
  grepArgs.push('--exclude-dir=dist')

  grepArgs.push('--', args.pattern, searchPath)
  return grepArgs
}

function truncateOutput(output: string, maxOutputSize: number): string {
  if (output.length <= maxOutputSize) return output.trim()
  const truncated = output.slice(0, maxOutputSize)
  const lastNewline = truncated.lastIndexOf('\n')
  const clean = lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated
  return `${clean}\n\n... [output truncated at ${maxOutputSize} bytes]`
}

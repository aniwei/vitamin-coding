import { z } from 'zod'
import { resolve, relative } from 'node:path'
import { readFile } from 'node:fs/promises'
import { spawn as nodeSpawn } from 'node:child_process'
import { TOOLS_MAX_OUTPUT_BYTES, TOOLS_MAX_OUTPUT_LINES } from '@vitamin/env'
import { exists, formatBytes, normalizePath, truncateHead, truncateLine } from '@vitamin/shared'
import type { AgentTool, ToolResult } from '@vitamin/agent'
import type { BinaryToolExecutorRegistry } from '../binary/binary-executor-registry'
import { BinaryToolExecutor } from '../binary/binary-executor'

const GREP_DEFAULT_LIMIT = 100
const GREP_MAX_LINE_LENGTH = 500

const GrepArgsSchema = z.object({
  pattern: z.string().describe('Search pattern (regex or literal string)'),
  path: z.string().optional().describe('Directory or file to search (default: current directory)'),
  glob: z
    .string()
    .optional()
    .describe('Filter files by glob pattern, e.g. "*.ts" or "**/*.spec.ts"'),
  ignoreCase: z.boolean().optional().describe('Case-insensitive search (default: false)'),
  literal: z
    .boolean()
    .optional()
    .describe('Treat pattern as literal string instead of regex (default: false)'),
  context: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Number of lines to show before and after each match (default: 0)'),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(`Maximum number of matches to return (default: ${GREP_DEFAULT_LIMIT})`),
})

type GrepArgs = z.infer<typeof GrepArgsSchema>

interface GrepToolOptions {
  binaryToolExecutorRegistry?: BinaryToolExecutorRegistry
}

interface RgMatch {
  path: string
  lineNumber: number
  text: string
}

export function createGrep(projectRoot: string, options: GrepToolOptions): AgentTool<GrepArgs> {
  return {
    name: 'grep',
    description: `Search file contents for pattern matches. Returns matching lines with file paths and line numbers. Respects .gitignore. Truncated to ${GREP_DEFAULT_LIMIT} matches or ${TOOLS_MAX_OUTPUT_BYTES / 1024}KB. Long lines truncated to ${GREP_MAX_LINE_LENGTH} chars.`,
    parameters: GrepArgsSchema,
    visibility: 'always',
    readonly: true,

    async execute({ params }): Promise<ToolResult> {
      const searchPath = resolve(projectRoot, params.path ?? '.')
      const normalizedSearchPath = normalizePath(searchPath)

      if (!(await exists(normalizedSearchPath))) {
        throw new Error(`Search path does not exist: ${params.path ?? '.'}`)
      }

      return await grep(
        params.pattern,
        normalizedSearchPath,
        projectRoot,
        params.glob,
        params.literal ?? false,
        params.ignoreCase ?? false,
        params.context ?? 0,
        params.limit ?? GREP_DEFAULT_LIMIT,
        options.binaryToolExecutorRegistry,
      )
    },
  }
}

function buildRgArgs(
  pattern: string,
  targetDir: string,
  ignoreCase: boolean,
  literal: boolean,
  glob?: string,
  limit?: number,
): string[] {
  const args: string[] = ['--json', '--line-number', '--color=never', '--hidden']

  if (ignoreCase) {
    args.push('--ignore-case')
  }

  if (literal) {
    args.push('--fixed-strings')
  }

  if (glob) {
    args.push('--glob', glob)
  }

  if (limit != null) {
    args.push('--max-count', String(limit))
  }

  args.push(pattern, targetDir)

  return args
}

function parseRgJsonOutput(stdout: string): RgMatch[] {
  const matches: RgMatch[] = []

  for (const line of stdout.split('\n')) {
    if (!line.trim()) {
      continue
    }

    try {
      const parsed = JSON.parse(line)

      if (parsed.type === 'match') {
        const data = parsed.data
        matches.push({
          path: data.path?.text ?? '',
          lineNumber: data.line_number ?? 0,
          text: data.lines?.text?.replace(/\n$/, '') ?? '',
        })
      }
    } catch {
      // 跳过格式错误的 JSON 行
    }
  }

  return matches
}

async function readContextLines(
  filePath: string,
  matchLineNumber: number,
  contextSize: number,
): Promise<{ before: { line: number; text: string }[]; after: { line: number; text: string }[] }> {
  if (contextSize <= 0) {
    return { before: [], after: [] }
  }

  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n')
    const idx = matchLineNumber - 1 // 0-based

    const beforeStart = Math.max(0, idx - contextSize)
    const afterEnd = Math.min(lines.length - 1, idx + contextSize)

    const before: { line: number; text: string }[] = []
    for (let i = beforeStart; i < idx; i++) {
      before.push({ line: i + 1, text: lines[i] ?? '' })
    }

    const after: { line: number; text: string }[] = []
    for (let i = idx + 1; i <= afterEnd; i++) {
      after.push({ line: i + 1, text: lines[i] ?? '' })
    }

    return { before, after }
  } catch {
    return { before: [], after: [] }
  }
}

function formatMatchWithContext(
  match: RgMatch,
  relativePath: string,
  context: { before: { line: number; text: string }[]; after: { line: number; text: string }[] },
): string {
  const outputLines: string[] = []

  for (const ctx of context.before) {
    const { text: truncated } = truncateLine(ctx.text, GREP_MAX_LINE_LENGTH)
    outputLines.push(`${relativePath}-${ctx.line}- ${truncated}`)
  }

  const { text: matchTruncated } = truncateLine(match.text, GREP_MAX_LINE_LENGTH)
  outputLines.push(`${relativePath}:${match.lineNumber}: ${matchTruncated}`)

  for (const ctx of context.after) {
    const { text: truncated } = truncateLine(ctx.text, GREP_MAX_LINE_LENGTH)
    outputLines.push(`${relativePath}-${ctx.line}- ${truncated}`)
  }

  return outputLines.join('\n')
}

async function executeRg(
  rgPath: string,
  args: string[],
): Promise<{ stdout: string; exitCode: number | null; error?: string }> {
  return new Promise((resolve) => {
    const ps = nodeSpawn(rgPath, args, { stdio: 'pipe' })
    const stdout: Buffer[] = []

    ps.stdout.on('data', (data) => stdout.push(data))
    ps.stderr.on('data', () => {}) // 消耗 stderr，防止堵塞

    ps.on('error', (err) => {
      resolve({ stdout: '', exitCode: -999, error: err.message })
    })

    ps.on('close', (code) => {
      // rg 退出码: 0 表示有匹配，1 表示无匹配，2 表示错误，均属正常结果
      resolve({
        stdout: Buffer.concat(stdout).toString('utf-8'),
        exitCode: code,
      })
    })
  })
}

async function grep(
  pattern: string,
  targetDir: string,
  projectRoot: string,
  glob: string | undefined,
  literal: boolean,
  ignoreCase: boolean,
  contextSize: number,
  limit: number,
  binaryExecutorRegistry?: BinaryToolExecutorRegistry,
): Promise<ToolResult> {
  if (!binaryExecutorRegistry) {
    throw new Error('Binary tool executor registry is not available')
  }

  const rgTool = binaryExecutorRegistry.get('rg')
  if (!rgTool) {
    throw new Error('ripgrep (rg) executor is not available')
  }

  // 确保 rg 已下载并可用
  let rgPath: string
  if (rgTool instanceof BinaryToolExecutor) {
    rgPath = await rgTool.ensure()
  } else {
    rgPath = 'rg'
  }

  const args = buildRgArgs(pattern, targetDir, ignoreCase, literal, glob, limit)

  // 直接执行 rg — 自行处理非零退出码（rg 退出码 1 = 无匹配，属于正常）
  const result = await executeRg(rgPath, args)

  // spawn 失败（二进制未找到、权限错误等）
  if (result.exitCode === -999) {
    throw new Error(`Failed to execute ripgrep: ${result.error ?? 'unknown error'}`)
  }

  // rg 退出码 2 表示错误
  if (result.exitCode === 2) {
    throw new Error(`ripgrep error while searching for "${pattern}"`)
  }

  // 解析 JSON 输出
  const allMatches = parseRgJsonOutput(result.stdout)

  if (allMatches.length === 0) {
    return {
      content: [{ type: 'text', text: 'No matches found.' }],
    }
  }

  // 应用数量限制
  const matchLimitReached = allMatches.length > limit
  const matches = allMatches.slice(0, limit)

  // 带上下文行格式化输出
  const outputBlocks: string[] = []
  let linesTruncated = 0

  // 按文件分组匹配结果，提高上下文行读取效率
  const matchesByFile = new Map<string, RgMatch[]>()
  for (const match of matches) {
    const existing = matchesByFile.get(match.path)
    if (existing) {
      existing.push(match)
    } else {
      matchesByFile.set(match.path, [match])
    }
  }

  for (const [filePath, fileMatches] of matchesByFile) {
    const relativePath = filePath.startsWith(projectRoot)
      ? relative(projectRoot, filePath)
      : relative(targetDir, filePath)

    for (const match of fileMatches) {
      const context = await readContextLines(filePath, match.lineNumber, contextSize)
      const block = formatMatchWithContext(match, relativePath, context)
      outputBlocks.push(block)

      // 统计被截断的行
      if (match.text.length > GREP_MAX_LINE_LENGTH) {
        linesTruncated++
      }
      for (const ctx of [...context.before, ...context.after]) {
        if (ctx.text.length > GREP_MAX_LINE_LENGTH) {
          linesTruncated++
        }
      }
    }
  }

  const raw = outputBlocks.join('\n--\n')

  const truncation = truncateHead(raw, {
    maxLines: TOOLS_MAX_OUTPUT_LINES,
    maxBytes: TOOLS_MAX_OUTPUT_BYTES,
  })

  let output = truncation.content
  const details: Record<string, unknown> = { truncation }
  const notices: string[] = []

  if (matchLimitReached) {
    notices.push(`${limit} match limit reached — use a more specific pattern or increase limit`)
    details.matchLimitReached = limit
  }

  if (truncation.truncated) {
    notices.push(`Output truncated (${formatBytes(TOOLS_MAX_OUTPUT_BYTES)} limit)`)
  }

  if (linesTruncated > 0) {
    notices.push(`${linesTruncated} long lines truncated to ${GREP_MAX_LINE_LENGTH} chars`)
    details.linesTruncated = linesTruncated
  }

  if (notices.length > 0) {
    output += `\n\n(${notices.join('. ')})`
  }

  return {
    content: [{ type: 'text', text: output }],
    details,
  }
}

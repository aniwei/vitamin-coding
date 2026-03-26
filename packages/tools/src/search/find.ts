import { z } from 'zod'
import { 
  TOOLS_MAX_OUTPUT_BYTES, 
  TOOLS_MAX_OUTPUT_LINES 
} from '@vitamin/env'
import { 
  createLogger,
  exists, 
  formatBytes, 
  isDirectory, 
  normalizePath, 
  truncateHead 
} from '@vitamin/shared'
import { join, relative, resolve } from 'node:path'
import { glob } from 'node:fs/promises'
import type { AgentTool, ToolResult } from '@vitamin/agent'
import type { BinaryToolExecutorRegistry } from '../binary/binary-executor-registry'

const logger = createLogger('@vitamin/tools:find')

const FindArgsSchema = z.object({
  pattern: z.string().describe('File name pattern with optional wildcards (*, ?), e.g. "*.ts", "data-??.json"'),
  path: z.string().optional().describe('Search starting path (default is project root)'),
  limit: z.number().int().min(1).max(500).optional().default(100).describe('Maximum number of results to return'),
})

type FindArgs = z.infer<typeof FindArgsSchema>
type Glob = (pattern: string, cwd: string, options: { ignore: string[]; limit: number }) => Promise<string[]>


interface FindToolOptions {
  glob?: Glob,
  binaryExecutorRegistry?: BinaryToolExecutorRegistry
}

export function createFind(
  projectRoot: string,
  options: FindToolOptions = {}
): AgentTool<FindArgs> {

  return {
    name: 'find',
    description: `Search for files by glob pattern. Returns matching file paths relative to the search directory. Respects .gitignore. Output is truncated to ${TOOLS_MAX_OUTPUT_LINES} results or ${TOOLS_MAX_OUTPUT_BYTES / 1024}KB (whichever is hit first).`,
    parameters: FindArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      const searchDir = resolve(projectRoot, params.path ?? '.')
      const normalizedSearchDir = normalizePath(searchDir)
      const limit = params.limit ?? TOOLS_MAX_OUTPUT_LINES
      
      if (!await exists(normalizedSearchDir)) {
        throw new Error(`Search path does not exist: ${params.path}`)
      }

      if (!await isDirectory(normalizedSearchDir)) {
        throw new Error(`Search path is not a directory: ${params.path}`)
      }

      return await find(
        normalizedSearchDir, 
        params.pattern, 
        limit, 
        options.glob, 
        options.binaryExecutorRegistry
      )
    }
  }
}

async function prepareSearchArgs (
  pattern: string,
  normalizedSearchDir: string, 
  limit: number
) {
  const args: string[] = [
    '--glob',
    '--color=never',
    '--hidden',
    '--max-results',
    String(limit),
  ]

  const ignores = new Set<string>()
  const root = join(normalizedSearchDir, '.gitignore')
  if (await exists(root)) {
    ignores.add(root)
  }

  try {
    for await (const file of await glob('**/.gitignore', {
      cwd: normalizedSearchDir,
    })) {
      ignores.add(file)
    }
  } catch { }

  for (const path of ignores) {
    args.push('--ignore-file', path)
  }

  args.push(pattern, normalizedSearchDir)

  return args
}


async function find(
  targetDir: string,
  pattern: string,
  limit: number,
  glob?: Glob,
  binaryExecutorRegistry?: BinaryToolExecutorRegistry
): Promise<ToolResult> {
  if (typeof glob === 'function') {
    logger.debug('Using custom glob implementation for find tool')

    const results = await glob(pattern, targetDir, {
      ignore: ['**/node_modules/**', '**/.git/**'],
      limit,
    })

    if (results.length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No files found matching pattern' }],
      }
    }

    const relativized = results.map(path => 
      path.startsWith(targetDir) 
        ? path.slice(targetDir.length + 1) 
        : relative(targetDir, path)
    )

    const resultLimitReached = relativized.length >= limit
    const raw = relativized.join('\n')
    const truncation = truncateHead(raw, { 
      maxLines: TOOLS_MAX_OUTPUT_LINES,
      maxBytes: TOOLS_MAX_OUTPUT_BYTES,
    })

    let content = truncation.content
    const details: Record<string, unknown> = {}
    const notices: string[] = []

    if (resultLimitReached) {
      notices.push(`${limit} results limit reached`)
      details.resultLimitReached = limit
    }

    if (truncation.truncated) {
      notices.push(`${formatBytes(TOOLS_MAX_OUTPUT_BYTES)} limit reached`)
      details.truncation = truncation
    }

    if (notices.length > 0) {
      content += `\n\n(${notices.join('. ')})`
    }

    return {
      content: [{ type: 'text' as const, text: content }],
      details
    }
  } 

  logger.debug('No custom glob provided, using fd binary for find tool')

  const fd = await binaryExecutorRegistry?.ensure('fd')
  if (!fd) {
    throw new Error('Find tool requires a glob implementation or fd binary available')
  }

  const args = await prepareSearchArgs(pattern, targetDir, limit)
  const result = await fd.execute(args, {
    // TODO: add max buffer
  })

  if (result.exitCode !== 0) {
    return {
      content: [{ type: 'text', text: result.stderr?.trim() || `fd exited with code ${result.exitCode}` }],
    }
  }

  const output = result.stdout?.trim() || ''

  if (!output) {
    return {
      content: [{ type: 'text', text: 'No files found matching pattern' }],
    }
  }

  const lines = output.split('\n')
  const relativized: string[] = []

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '').trim()
    if (!line) continue

    const hadTrailingSlash = line.endsWith('/') || line.endsWith('\\')
    let relativePath = line

    if (line.startsWith(targetDir)) {
      relativePath = line.slice(targetDir.length + 1)
    } else {
      relativePath = relative(targetDir, line)
    }

    if (hadTrailingSlash && !relativePath.endsWith('/')) {
      relativePath += '/'
    }

    relativized.push(relativePath)
  }

  const resultLimitReached = relativized.length >= limit
  const rawOutput = relativized.join('\n')
  const truncation = truncateHead(rawOutput, { 
    maxLines: TOOLS_MAX_OUTPUT_LINES,
    maxBytes: TOOLS_MAX_OUTPUT_BYTES,
  })

  let content = truncation.content
  const details: Record<string, unknown> = {}
  const notices: string[] = []

  if (resultLimitReached) {
    notices.push(`${limit} results limit reached. Use limit=${limit * 2} for more, or refine pattern`)
    details.resultLimitReached = limit
  }

  if (truncation.truncated) {
    notices.push(`${formatBytes(TOOLS_MAX_OUTPUT_BYTES)} limit reached`)
    details.truncation = truncation
  }

  if (notices.length > 0) {
    content += `\n\n(${notices.join('. ')})`
  }

  return {
    content: [{ type: 'text', text: content }],
    details
  }
}
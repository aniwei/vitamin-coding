import { z } from 'zod'
import { resolve } from 'node:path'
import { TOOLS_MAX_OUTPUT_LINES } from '@vitamin/env'
import { exists, isDirectory, normalizePath } from '@vitamin/shared'
import type { AgentTool, ToolResult } from '@vitamin/agent'
import type { BinaryToolExecutorRegistry } from '../binary/binary-executor-registry'

const GrepArgsSchema = z.object({
  pattern: z.string().describe('Search pattern (regex or plain text)'),
  path: z.string().optional().describe('Search path (default is project root)'),
  glob: z.string().optional().describe('Filter files by glob pattern, e.g. "*.ts" or "**/*.spec.ts"'),
  ignore: z.boolean().optional().default(false).describe('Ignore case when matching'),
  literal: z.boolean().optional().default(false).describe('Match pattern literally (case-sensitive)'),
  context: z.number().int().min(1).max(1000).optional().default(100).describe('Number of context lines to include around matches'),
  limit: z.number().optional().describe('Maximum number of results to return'),
})

type GrepArgs = z.infer<typeof GrepArgsSchema>

interface GrepToolOptions {
  binaryToolExecutorRegistry?: BinaryToolExecutorRegistry
}


export function createGrep(
  projectRoot: string,
  options: GrepToolOptions
): AgentTool<GrepArgs> {
  
  return {
    name: 'grep',
    description: 'Search for text or regex patterns in the project. Returns matching file names, line numbers, and content.',
    parameters: GrepArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      const searchDir = resolve(projectRoot, params.path ?? '.')
      const normalizedSearchDir = normalizePath(searchDir)

      const rg = await options.binaryToolExecutorRegistry?.get('rg')
      if (!rg) {
        throw new Error('ripgrep (rg) executor is not available')
      }

      if (!await exists(normalizedSearchDir)) {
        throw new Error(`Search path does not exist: ${params.path}`)
      }

      if (!await isDirectory(normalizedSearchDir)) {
        throw new Error(`Search path is not a directory: ${params.path}`)
      }

      return await grep(
        params.pattern,
        normalizedSearchDir,
        params.glob ?? '',
        params.literal ?? false,
        params.ignore ?? false,
        params.context && params.context > 0 ? params.context : 0,
        Math.max(1, params.limit ?? TOOLS_MAX_OUTPUT_LINES),
        options.binaryToolExecutorRegistry,
      )
    }
  }
}

function prepareSearchArgs(
  pattern: string,
  targetDir: string,
  ignore: boolean,
  literal: boolean,
  glob: string,
): string[] {
  const args: string[] = [
    '--json', 
    '--line-number', 
    '--color=never', 
    '--hidden'
  ]

  if (ignore) {
    args.push('--ignore-case')
  }

  if (literal) {
    args.push('--fixed-strings')
  }

  if (glob) {
    args.push('--glob', glob)
  }

  args.push(pattern, targetDir)

  return args
}

async function tryIsDirectory(path: string): Promise<boolean> {
  try {
    return await isDirectory(path)
  } catch {
    return false
  }
}

async function grep(
  pattern: string,
  targetDir: string,
  glob: string,
  ignore: boolean,
  literal: boolean,
  context: number,
  limit: number,
  binaryExecutorRegistry?: BinaryToolExecutorRegistry
): Promise<ToolResult> {
  const isDir: boolean = await tryIsDirectory(targetDir)

  const args = await prepareSearchArgs(
    pattern,
    targetDir,
    ignore,
    literal,
    glob
  )

  const rg = await binaryExecutorRegistry?.ensure('rg')
  const result = await rg?.execute(args, {})

  throw new Error('grep tool is not fully implemented yet')
}
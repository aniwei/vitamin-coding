import { z } from 'zod'

import { 
  TOOLS_MAX_OUTPUT_BYTES, 
  TOOLS_MAX_OUTPUT_LINES 
} from '@vitamin/env'
import { 
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

      if (typeof options.glob === 'function') {
        const results = await options.glob(params.pattern, normalizedSearchDir, {
          ignore: ['**/node_modules/**', '**/.git/**'],
          limit,
        })

        if (results.length === 0) {
          throw new Error('No files found matching pattern');
        }

        // Relativize paths
        const relativized = results.map((p) => {
          if (p.startsWith(normalizedSearchDir)) {
            return p.slice(normalizedSearchDir.length + 1)
          }

          return relative(normalizedSearchDir, p)
        })

        const resultLimitReached = relativized.length >= limit
        const rawOutput = relativized.join('\n')
        const truncation = truncateHead(rawOutput, { 
          maxLines: TOOLS_MAX_OUTPUT_LINES,
          maxBytes: TOOLS_MAX_OUTPUT_BYTES,
        })

        let resultOutput = truncation.content
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
          resultOutput += `\n\n(${notices.join('. ')})`
        }

        return {
          content: [{ type: 'text', text: resultOutput }],
          details
        }
      } 

      const fd = options.binaryExecutorRegistry?.get('fd')
      if (!fd) {
        throw new Error('Find tool requires a glob implementation or fd binary available')
      }

      // Build fd arguments
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

      for (const gitignorePath of ignores) {
        args.push('--ignore-file', gitignorePath)
      }

      args.push(params.pattern, normalizedSearchDir)

      const result = await fd.execute(args, {
        maxBuffer: 10 * 1024 * 1024,
      })

      if (result.error) {
        throw result.error
      }

      const output = result.stdout?.trim() || ''

      if (result.status !== 0) {
        const message = result.stderr?.trim() || `fd exited with code ${result.status}`
        if (!output) {
          throw new Error(message)
        }
      }

      if (!output) {
        return {
          content: [{ type: 'text', text: 'No files found matching pattern' }],
        }
      }

      const lines = output.split('\n')
      const relativized: string[] = []

      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, '').trim()
        if (!line) continue

        const hadTrailingSlash = line.endsWith('/') || line.endsWith('\\')
        let relativePath = line

        if (line.startsWith(normalizedSearchDir)) {
          relativePath = line.slice(normalizedSearchDir.length + 1)
        } else {
          relativePath = relative(normalizedSearchDir, line)
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

      let resultOutput = truncation.content
      const details: Record<string, unknown> = {}
      const notices: string[] = [];

      if (resultLimitReached) {
        notices.push(`${limit} results limit reached. Use limit=${limit * 2} for more, or refine pattern`)
        details.resultLimitReached = limit
      }

      if (truncation.truncated) {
        notices.push(`${formatBytes(TOOLS_MAX_OUTPUT_BYTES)} limit reached`)
        details.truncation = truncation
      }

      if (notices.length > 0) {
        resultOutput += `\n\n(${notices.join('. ')})`
      }

      return {
        content: [{ type: 'text', text: resultOutput }],
        details
      }
    },
  }
}

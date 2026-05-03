import { constants } from 'node:fs'
import { access, open, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@x-mars/agent'

const DEFAULT_LIMIT = 60_000
const MAX_LIMIT = 500_000

const ToolOutputReadArgsSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      'Artifact path from outputArtifact.path, or a relative path under .x-mars/tool-outputs.',
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Zero-based byte offset for continuing large artifact reads.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`Maximum bytes to return, capped at ${MAX_LIMIT}.`),
})

export type ToolOutputReadArgs = z.infer<typeof ToolOutputReadArgsSchema>

export function createToolOutputRead(projectRoot: string): AgentTool<ToolOutputReadArgs> {
  const baseDir = resolve(projectRoot, '.x-mars', 'tool-outputs')

  return {
    name: 'tool_output_read',
    description:
      'Read persisted full tool output artifacts created when large tool results are previewed and stored.',
    parameters: ToolOutputReadArgsSchema,
    visibility: 'always',
    readonly: true,

    async execute({ params }): Promise<ToolResult> {
      const resolvedPath = resolveArtifactPath(baseDir, params.path)
      if (!resolvedPath.allowed) {
        return {
          content: [{ type: 'text', text: resolvedPath.error }],
          isError: true,
          details: {
            path: params.path,
            baseDir,
            reason: 'path_outside_tool_outputs',
          },
        }
      }

      try {
        await access(resolvedPath.path, constants.R_OK)
        const fileStat = await stat(resolvedPath.path)
        if (!fileStat.isFile()) {
          return {
            content: [{ type: 'text', text: `Artifact is not a file: ${params.path}` }],
            isError: true,
            details: {
              path: resolvedPath.path,
              reason: 'not_file',
            },
          }
        }

        const offset = params.offset ?? 0
        const limit = params.limit ?? DEFAULT_LIMIT
        const chunk = await readChunk(resolvedPath.path, offset, Math.min(limit, fileStat.size))
        const text = chunk.toString('utf-8')
        const hasMore = offset + chunk.length < fileStat.size

        return {
          content: [
            {
              type: 'text',
              text: hasMore
                ? `${text}\n\n(Showing bytes ${offset}-${offset + chunk.length} of ${fileStat.size}. Use offset=${offset + chunk.length} to continue.)`
                : text,
            },
          ],
          details: {
            path: resolvedPath.path,
            relativePath: relative(baseDir, resolvedPath.path),
            offset,
            limit,
            sizeBytes: fileStat.size,
            returnedBytes: chunk.length,
            hasMore,
          },
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: [{ type: 'text', text: `Failed to read tool output artifact: ${message}` }],
          isError: true,
          details: {
            path: resolvedPath.path,
            reason: 'read_failed',
            error: message,
          },
        }
      }
    },
  }
}

async function readChunk(filePath: string, offset: number, limit: number): Promise<Buffer> {
  if (limit <= 0) {
    return Buffer.alloc(0)
  }

  const handle = await open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(limit)
    const { bytesRead } = await handle.read(buffer, 0, limit, offset)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

function resolveArtifactPath(
  baseDir: string,
  inputPath: string,
): { allowed: true; path: string } | { allowed: false; error: string } {
  const resolvedPath = isAbsolute(inputPath) ? resolve(inputPath) : resolve(baseDir, inputPath)
  const rel = relative(baseDir, resolvedPath)
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    return { allowed: true, path: resolvedPath }
  }

  return {
    allowed: false,
    error: `Refusing to read artifact outside .x-mars/tool-outputs: ${inputPath}`,
  }
}

// ls 工具 — 目录列表（递归可选）
import { 
  exists, 
  formatBytes, 
  isDirectory, 
  normalizePath, 
  truncateHead, 
} from '@vitamin/shared'
import {
  TOOLS_LS_MAX_ENTRIES, 
  TOOLS_MAX_OUTPUT_BYTES,
  TOOLS_MAX_OUTPUT_LINES,
} from '@vitamin/env'
import { resolve } from 'node:path'
import { readdir } from 'node:fs/promises'
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const LsArgsSchema = z.object({
  path: z.string().optional().default('.').describe('Directory path to list (relative to project root)'),
  limit: z.number().int().min(1).max(2000).optional().default(500).describe('Maximum number of entries to list')
})

type LsArgs = z.infer<typeof LsArgsSchema>

export function createLs(projectRoot: string): AgentTool<LsArgs> {
  return {
    name: 'ls',
    description: 'List directory contents. Can optionally show subdirectory structure recursively.',
    parameters: LsArgsSchema,
    visibility: 'always',
    readonly: true,

    async execute({ params }): Promise<ToolResult> {
      const targetDir = resolve(projectRoot, params.path)
      const normaizedTargetDir = normalizePath(targetDir)
      const limit = params.limit ?? TOOLS_LS_MAX_ENTRIES

      if (!await exists(normaizedTargetDir)) {
        throw new Error(`Directory not found: ${params.path}`)
      }

      if (!await isDirectory(normaizedTargetDir)) {
        throw new Error(`Not a directory: ${params.path}`)
      }

      return await ls(normaizedTargetDir, limit)
    },
  }
}

async function ls(
  dir: string,
  limit: number
): Promise<ToolResult> {
  const entries = await readdir(dir)
  entries.sort((a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const results: string[] = [];
  let entryLimitReached = false;

  for (const entry of entries) {
    if (results.length >= limit) {
      entryLimitReached = true
      break
    }

    const path = resolve(dir, entry)
    let suffix = ''

    try {
      if (await isDirectory(path)) {
        suffix = '/'
      }
    } catch {
      continue
    }

    results.push(entry + suffix)
  }

  if (results.length === 0) {
    return { content: [{ type: 'text', text: 'Directory is empty.' }] }
  }

  const raw = results.join('\n')
  const truncation = truncateHead(raw, { maxLines: TOOLS_MAX_OUTPUT_LINES, maxBytes: TOOLS_MAX_OUTPUT_BYTES })

  let output = truncation.content
  const details: Record<string, unknown> = {}

  const notices: string[] = []

  if (entryLimitReached) {
    notices.push(`${limit} entries limit reached. Use limit=${limit * 2} for more`)
    details.entryLimitReached = limit
  }

  if (truncation.truncated) {
    notices.push(`${formatBytes(TOOLS_MAX_OUTPUT_BYTES)} limit reached`)
    details.truncation = truncation
  }

  if (notices.length > 0) {
    output += `\n\n(${notices.join(". ")})`;
  }

  return {
    content: [{ type: 'text', text: output }],
    details
  }
}

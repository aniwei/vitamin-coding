import { createTempLoggerPath, formatBytes, truncateTail } from '@vitamin/shared'
import {
  TOOLS_EXECUTE_TIMEOUT_MS,
  TOOLS_MAX_OUTPUT_BYTES,
  TOOLS_MAX_OUTPUT_LINES,
} from '@vitamin/env'
import { createWriteStream, WriteStream } from 'node:fs'
import { spawn } from './process'
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'
import { resolve } from 'node:path'

// 参数 schema
const BashArgsSchema = z.object({
  command: z.string().describe('Shell command to execute'),
  targetDir: z.string().optional().describe('Working directory (relative to project root)'),
  timeout: z.number().int().min(1000).optional().describe('Timeout (ms), default 30000'),
})

type BashArgs = z.infer<typeof BashArgsSchema>

type ProgressCallback = (result: ToolResult) => void

// 创建 bash 工具
export function createBash(
  projectRoot: string,
  onProgress?: ProgressCallback,
): AgentTool<BashArgs> {
  return {
    name: 'bash',
    description: 'Execute a shell command and return stdout/stderr. Default timeout is 30 seconds.',
    parameters: BashArgsSchema,
    visibility: 'always',
    readonly: (params) => isReadOnlyShellCommand(params.command),
    isReadOnly: (params) => isReadOnlyShellCommand(params.command),
    isConcurrencySafe: (params) => isReadOnlyShellCommand(params.command),

    async execute({ params, signal }): Promise<ToolResult> {
      const targetDir = resolve(projectRoot, params.targetDir ?? '.')
      const timeout = params.timeout ?? TOOLS_EXECUTE_TIMEOUT_MS

      return await bash(params.command, targetDir, timeout, onProgress, signal)
    },
  }
}

export function isReadOnlyShellCommand(command: string): boolean {
  const normalized = command.trim()
  if (!normalized) return false
  if (hasWriteRedirection(normalized) || /[`$][({]/.test(normalized)) return false

  const segments = normalized
    .split(/\s*(?:&&|\|\||;|\|)\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (segments.length === 0) return false
  return segments.every(isReadOnlyShellSegment)
}

function isReadOnlyShellSegment(segment: string): boolean {
  const withoutEnv = segment.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)+/, '')
  const tokens =
    withoutEnv.match(/"[^"]*"|'[^']*'|\S+/g)?.map((token) => token.replace(/^['"]|['"]$/g, '')) ??
    []
  const command = tokens[0]
  if (!command) return false

  if (command === 'git') {
    const subcommand = tokens.find((token, index) => index > 0 && !token.startsWith('-'))
    return (
      subcommand !== undefined &&
      ['status', 'diff', 'log', 'show', 'branch', 'rev-parse', 'ls-files', 'grep'].includes(
        subcommand,
      )
    )
  }

  if ((command === 'sed' && tokens.includes('-i')) || (command === 'perl' && tokens.includes('-pi'))) {
    return false
  }

  return [
    'pwd',
    'ls',
    'cat',
    'head',
    'tail',
    'grep',
    'rg',
    'find',
    'fd',
    'wc',
    'du',
    'df',
    'stat',
    'file',
    'which',
    'type',
    'test',
    '[',
    'true',
    'false',
  ].includes(command)
}

function hasWriteRedirection(command: string): boolean {
  return /(^|[^\\])(?:>>?|[0-9]>>?|&>)/.test(command)
}

async function bash(
  command: string,
  targetDir: string,
  timeout: number,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const maxOutputBytes = TOOLS_MAX_OUTPUT_BYTES * 2
  const output: Buffer[] = []
  let totalBytes = 0
  let outputBytes = 0
  let outputPath: string | undefined
  let outputStream: WriteStream | undefined

  const result = await spawn('sh', ['-c', command], {
    timeout,
    signal,
    cwd: targetDir,
    onProgress: (chunk) => {
      output.push(chunk)
      totalBytes += chunk.byteLength
      outputBytes += chunk.byteLength

      const text = Buffer.concat(output).toString('utf-8')
      const truncation = truncateTail(text, {
        maxLines: TOOLS_MAX_OUTPUT_LINES,
        maxBytes: TOOLS_MAX_OUTPUT_BYTES,
      })

      if (totalBytes > TOOLS_MAX_OUTPUT_BYTES && !outputPath) {
        outputPath = createTempLoggerPath()
        outputStream = createWriteStream(outputPath)

        for (const buf of output) {
          outputStream.write(buf)
        }
      }

      if (outputStream) {
        outputStream.write(chunk)
      }

      while (outputBytes > maxOutputBytes && output.length > 1) {
        const removed = output.shift()
        if (removed) {
          outputBytes -= removed.byteLength
        }
      }

      onProgress?.({
        content: [{ type: 'text', text: truncation.content || '' }],
        details: {
          truncation,
          outputPath,
        },
      })
    },
  })

  outputStream?.end()

  const buffer = Buffer.concat(output)
  const fullOutput = buffer.toString('utf-8')

  const truncation = truncateTail(fullOutput, {
    maxLines: TOOLS_MAX_OUTPUT_LINES,
    maxBytes: TOOLS_MAX_OUTPUT_BYTES,
  })
  let text = truncation.content || '(no output)'

  const details = {
    truncation,
    outputPath,
  }

  if (truncation.truncated) {
    const start = truncation.totalLines - truncation.outputLines + 1
    const end = truncation.totalLines

    if (truncation.lastLinePartial) {
      const lastLineSize = formatBytes(
        Buffer.byteLength(fullOutput.split('\n').pop() || '', 'utf-8'),
      )
      text += `\n\n(Showing last ${formatBytes(truncation.outputBytes)} of line ${end} (line is ${lastLineSize}). Full output: ${outputPath})`
    } else if (truncation.truncatedBy === 'lines') {
      text += `\n\n(Showing lines ${start}-${end} of ${truncation.totalLines}. Full output: ${outputPath})`
    } else {
      text += `\n\n(Showing lines ${start}-${end} of ${truncation.totalLines} (${formatBytes(TOOLS_MAX_OUTPUT_BYTES)} limit). Full output: ${outputPath})`
    }
  }

  if (result.exitCode !== 0) {
    text += `\n\nCommand exited with code ${result.exitCode}`
    return {
      content: [{ type: 'text', text }],
      isError: true,
      details,
    }
  } else {
    return { content: [{ type: 'text', text }], details }
  }
}

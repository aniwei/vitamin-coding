import { 
  createTempLoggerPath, 
  formatBytes, 
  truncateTail 
} from '@vitamin/shared'
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
  onProgress: z.function().describe('Command execution progress callback, receives output chunk')
})

type BashArgs = z.infer<typeof BashArgsSchema>

type ProgressCallback = (result: ToolResult) => void

// 创建 bash 工具
export function createBash(
  projectRoot: string,
  onProgress?: ProgressCallback
): AgentTool<BashArgs> {
  return {
    name: 'bash',
    description: 'Execute a shell command and return stdout/stderr. Default timeout is 30 seconds.',
    parameters: BashArgsSchema,
    visibility: 'always',

    async execute({ params, signal }): Promise<ToolResult> {
      const targetDir = resolve(projectRoot, params.targetDir ?? '.')
      const timeout = params.timeout ?? TOOLS_EXECUTE_TIMEOUT_MS

      return await bash(
        params.command, 
        targetDir, 
        timeout, 
        onProgress, 
        signal
      )
    }
  }
}

async function bash(
  command: string,
  targetDir: string,
  timeout: number,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<ToolResult> {
  const maxOutputBytes = TOOLS_MAX_OUTPUT_BYTES * 2
  let output: Buffer[] = []
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

      const text = Buffer.concat(output).toString('utf-8')
      const truncation = truncateTail(text, { maxLines: TOOLS_MAX_OUTPUT_LINES, maxBytes: TOOLS_MAX_OUTPUT_BYTES })

      if (totalBytes > TOOLS_MAX_OUTPUT_BYTES && !outputPath) {
        outputPath = createTempLoggerPath()
        outputStream = createWriteStream(outputPath)
        
        for (const chunk of output) {
          outputStream.write(chunk)
        }
      }

      if (outputStream) {
        outputStream.write(chunk)
      }

      output.push(chunk)
      outputBytes += chunk.byteLength

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
          outputPath
        },
      })
    }
  })

  outputStream?.end()

  const buffer = Buffer.concat(output)
  const fullOutput = buffer.toString('utf-8')

  const truncation = truncateTail(fullOutput, { maxLines: TOOLS_MAX_OUTPUT_LINES, maxBytes: TOOLS_MAX_OUTPUT_BYTES })
  let text = truncation.content || '(no output)'

  const details = {
    truncation,
    outputPath
  }

  if (truncation.truncated) {
    const start = truncation.totalLines - truncation.outputLines + 1
    const end = truncation.totalLines

    if (truncation.lastLinePartial) {
      const lastLineSize = formatBytes(Buffer.byteLength(fullOutput.split('\n').pop() || '', 'utf-8'))
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
      details
    }
  } else {
    return { content: [{ type: 'text', text }], details }
  }
}

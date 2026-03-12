import { spawnProcess } from '@vitamin/shared'
import { truncate } from '@vitamin/shared'
// bash 工具 — 执行 shell 命令
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

// 输出最大长度（60KB）
const DEFAULT_MAX_OUTPUT_LENGTH = 60 * 1024

// 默认超时（30 秒）
const DEFAULT_TIMEOUT = 30_000

// 参数 schema
const BashArgsSchema = z.object({
  command: z.string().describe('要执行的 shell 命令'),
  cwd: z.string().optional().describe('工作目录（相对于项目根目录）'),
  timeout: z.number().int().min(1000).optional().describe('超时时间（毫秒），默认 30000'),
})

type BashArgs = z.infer<typeof BashArgsSchema>

interface BashOptions {
  timeout?: number,
  maxOutputSize?: number,
}

// 创建 bash 工具
export function createBash(
  projectRoot: string,
  options: BashOptions
): AgentTool<BashArgs> {
  const { 
    timeout = DEFAULT_TIMEOUT, 
    maxOutputSize = DEFAULT_MAX_OUTPUT_LENGTH 
  } = options

  return {
    name: 'bash',
    description: '执行 shell 命令并返回 stdout/stderr。默认超时 30 秒',
    parameters: BashArgsSchema,
    visibility: 'always',

    async execute(_id, args, signal): Promise<ToolResult> {
      const cwd = args.cwd ? `${projectRoot}/${args.cwd}` : projectRoot

      const t = args.timeout ?? timeout

      try {
        const result = await spawnProcess({
          command: 'sh',
          args: ['-c', args.command],
          timeout: t,
          signal,
          cwd,
        })

        // 组合输出
        let output = ''
        if (result.stdout) {
          output += result.stdout
        }

        if (result.stderr) {
          output += output ? '\n--- stderr ---\n' : ''
          output += result.stderr
        }

        // 截断过长输出
        if (output.length > maxOutputSize) {
          output = truncate(output, maxOutputSize)
          output += '\n... (output truncated)'
        }

        if (!output) {
          output = '(no output)'
        }

        const isError = result.exitCode !== 0

        return {
          content: [{ type: 'text', text: isError ? `Command exited with code ${result.exitCode}\n${output}` : output }],
          isError,
          metadata: {
            exitCode: result.exitCode,
            command: args.command,
            cwd,
          },
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: [{ type: 'text', text: `Command failed: ${message}` }],
          isError: true,
          metadata: {
            command: args.command,
            cwd,
          }
        }
      }
    },
  }
}

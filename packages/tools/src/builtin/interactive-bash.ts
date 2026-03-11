// interactive-bash 工具 — 交互式终端命令执行
import { spawn } from 'node:child_process'
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'
import { resolvePath } from '@vitamin/shared'

const TIMEOUT_MS = 120_000 // 2 分钟超时
const MAX_OUTPUT_SIZE = 100_000 // 100KB 输出限制

const InteractiveBashArgsSchema = z.object({
  command: z.string().describe('要执行的 shell 命令'),
  cwd: z.string().optional().describe('工作目录（相对于项目根）'),
  timeout: z.number().int().min(1000).max(600_000).optional()
    .describe('超时时间（毫秒，默认 120000）'),
  stdin: z.string().optional().describe('传递给命令的标准输入'),
})

type InteractiveBashArgs = z.infer<typeof InteractiveBashArgsSchema>

export function createInteractiveBashTool(projectRoot: string): AgentTool<InteractiveBashArgs> {
  return {
    name: 'interactive-bash',
    description: '执行交互式终端命令，支持 stdin 输入和超时控制。',
    parameters: InteractiveBashArgsSchema,
    visibility: 'always',

    async execute(_id, args, signal): Promise<ToolResult> {
      const cwd = args.cwd ? resolvePath(projectRoot, args.cwd) : projectRoot
      const timeout = args.timeout ?? TIMEOUT_MS

      return new Promise((resolve) => {
        let stdout = ''
        let stderr = ''
        let killed = false

        const child = spawn('sh', ['-c', args.command], {
          cwd,
          env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' },
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        const timer = setTimeout(() => {
          killed = true
          child.kill('SIGTERM')
        }, timeout)

        const abortHandler = () => {
          killed = true
          child.kill('SIGTERM')
        }
        signal?.addEventListener('abort', abortHandler, { once: true })

        child.stdout.on('data', (data: Buffer) => {
          stdout += data.toString()
          if (stdout.length > MAX_OUTPUT_SIZE) {
            stdout = stdout.slice(0, MAX_OUTPUT_SIZE) + '\n... (output truncated)'
            killed = true
            child.kill('SIGTERM')
          }
        })

        child.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()
          if (stderr.length > MAX_OUTPUT_SIZE) {
            stderr = stderr.slice(0, MAX_OUTPUT_SIZE) + '\n... (output truncated)'
          }
        })

        if (args.stdin) {
          child.stdin.write(args.stdin)
          child.stdin.end()
        }

        child.on('close', (code) => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', abortHandler)

          const output = [
            stdout ? `STDOUT:\n${stdout}` : '',
            stderr ? `STDERR:\n${stderr}` : '',
            `Exit code: ${code ?? 'unknown'}`,
            killed ? '(process was killed)' : '',
          ].filter(Boolean).join('\n\n')

          resolve({
            content: [{ type: 'text', text: output }],
            isError: (code ?? 1) !== 0,
          })
        })

        child.on('error', (error) => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', abortHandler)
          resolve({
            content: [{ type: 'text', text: `Command failed: ${error.message}` }],
            isError: true,
          })
        })
      })
    },
  }
}

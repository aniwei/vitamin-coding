import vm from 'node:vm'
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@x-mars/agent'

const ExecuteCodeArgsSchema = z.object({
  script: z
    .string()
    .min(1)
    .describe('JavaScript code to run. Use await rpc.callTool(name, params).'),
  allowedTools: z.array(z.string()).min(1).max(20).describe('Tool names this script may call.'),
  timeoutMs: z.number().int().min(100).max(30_000).optional().describe('Execution timeout in ms.'),
  maxToolCalls: z.number().int().min(1).max(50).optional().describe('Maximum RPC tool calls.'),
})

type ExecuteCodeArgs = z.infer<typeof ExecuteCodeArgsSchema>

export interface ProgrammaticToolCall {
  name: string
  params: Record<string, unknown>
}

export interface ProgrammaticToolCallResult {
  name: string
  params: Record<string, unknown>
  result: ToolResult
}

export type ProgrammaticToolInvoker = (call: ProgrammaticToolCall) => Promise<ToolResult>

interface ExecuteCodeOptions {
  invokeTool?: ProgrammaticToolInvoker
}

export function createExecuteCode(options: ExecuteCodeOptions = {}): AgentTool<ExecuteCodeArgs> {
  return {
    name: 'execute_code',
    description:
      'Run short JavaScript orchestration code that can call an explicit whitelist of tools through rpc.callTool.',
    parameters: ExecuteCodeArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!options.invokeTool) {
        throw new Error('Programmatic tool invoker is not provided in options')
      }

      const timeoutMs = params.timeoutMs ?? 5000
      const maxToolCalls = params.maxToolCalls ?? 10
      const allowedTools = new Set(params.allowedTools)
      const calls: ProgrammaticToolCallResult[] = []
      const logs: string[] = []

      const context = vm.createContext({
        rpc: {
          callTool: async (name: string, toolParams: Record<string, unknown> = {}) => {
            if (!allowedTools.has(name)) {
              throw new Error(`Tool "${name}" is not in allowedTools`)
            }
            if (name === 'execute_code') {
              throw new Error('execute_code cannot call itself')
            }
            if (calls.length >= maxToolCalls) {
              throw new Error(`maxToolCalls exceeded: ${maxToolCalls}`)
            }

            const result = await options.invokeTool!({ name, params: toolParams })
            calls.push({ name, params: toolParams, result })
            return result
          },
        },
        console: {
          log: (...values: unknown[]) => {
            logs.push(values.map((value) => stringifyLogValue(value)).join(' '))
          },
        },
      })

      try {
        const script = new vm.Script(`"use strict"; (async () => {\n${params.script}\n})()`)
        const value = await withTimeout(
          Promise.resolve(script.runInContext(context, { timeout: Math.min(timeoutMs, 1000) })),
          timeoutMs,
        )

        return {
          content: [
            {
              type: 'text',
              text: formatExecuteCodeResult({ value, logs, calls }),
            },
          ],
          details: {
            result: value,
            logs,
            calls: calls.map((call) => ({
              name: call.name,
              params: call.params,
              isError: call.result.isError ?? false,
            })),
          },
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `execute_code failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: {
            logs,
            calls: calls.map((call) => ({
              name: call.name,
              params: call.params,
              isError: call.result.isError ?? false,
            })),
          },
        }
      }
    },
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Execution timed out after ${timeoutMs}ms`)),
      timeoutMs,
    )
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

function stringifyLogValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatExecuteCodeResult(input: {
  value: unknown
  logs: string[]
  calls: ProgrammaticToolCallResult[]
}): string {
  const lines = ['execute_code completed.']
  if (input.logs.length > 0) {
    lines.push('', 'Logs:', ...input.logs.map((line) => `- ${line}`))
  }
  lines.push('', `Tool calls: ${input.calls.length}`)
  for (const call of input.calls) {
    lines.push(`- ${call.name}: ${call.result.isError ? 'error' : 'ok'}`)
  }
  if (input.value !== undefined) {
    lines.push('', `Return: ${stringifyLogValue(input.value)}`)
  }
  return lines.join('\n')
}

import { spawn } from 'node:child_process'
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
  maxOutputBytes: z
    .number()
    .int()
    .min(1024)
    .max(131_072)
    .optional()
    .describe('Maximum captured stdout/stderr bytes.'),
  maxResultBytes: z
    .number()
    .int()
    .min(1024)
    .max(131_072)
    .optional()
    .describe('Maximum serialized return value bytes.'),
})

type ExecuteCodeArgs = z.infer<typeof ExecuteCodeArgsSchema>

export interface ProgrammaticToolCall {
  name: string
  params: Record<string, unknown>
  signal?: AbortSignal
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

    async execute({ params, signal }): Promise<ToolResult> {
      if (!options.invokeTool) {
        throw new Error('Programmatic tool invoker is not provided in options')
      }

      const timeoutMs = params.timeoutMs ?? 5000
      const maxToolCalls = params.maxToolCalls ?? 10
      const maxOutputBytes = params.maxOutputBytes ?? 16_384
      const maxResultBytes = params.maxResultBytes ?? 16_384
      const allowedTools = new Set(params.allowedTools)
      const calls: ProgrammaticToolCallResult[] = []
      const stdout: string[] = []
      const stderr: string[] = []
      const outputBudget = createOutputBudget(maxOutputBytes)

      const pushStdout = (...values: unknown[]) => {
        captureOutput(
          stdout,
          values.map((value) => stringifyLogValue(value)).join(' '),
          outputBudget,
        )
      }
      const pushStderr = (...values: unknown[]) => {
        captureOutput(
          stderr,
          values.map((value) => stringifyLogValue(value)).join(' '),
          outputBudget,
        )
      }

      try {
        const value = await runScriptInChildProcess({
          script: params.script,
          timeoutMs,
          signal,
          allowedTools,
          maxToolCalls,
          invokeTool: options.invokeTool,
          calls,
          pushStdout,
          pushStderr,
        })
        const resultDetail = createResultDetail(value, maxResultBytes)

        return {
          content: [
            {
              type: 'text',
              text: formatExecuteCodeResult({
                resultPreview: resultDetail.preview,
                resultTruncated: resultDetail.truncated,
                stdout,
                stderr,
                outputTruncated: outputBudget.truncated,
                calls,
              }),
            },
          ],
          details: {
            executionMode: 'child_process',
            result: resultDetail.value,
            resultPreview: resultDetail.preview,
            resultTruncated: resultDetail.truncated,
            stdout,
            stderr,
            logs: stdout,
            outputTruncated: outputBudget.truncated,
            maxOutputBytes,
            maxResultBytes,
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
            executionMode: 'child_process',
            stdout,
            stderr,
            logs: stdout,
            outputTruncated: outputBudget.truncated,
            maxOutputBytes,
            maxResultBytes,
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

interface RunScriptInChildProcessInput {
  script: string
  timeoutMs: number
  signal: AbortSignal
  allowedTools: Set<string>
  maxToolCalls: number
  invokeTool: ProgrammaticToolInvoker
  calls: ProgrammaticToolCallResult[]
  pushStdout: (...values: unknown[]) => void
  pushStderr: (...values: unknown[]) => void
}

interface ChildErrorPayload {
  message: string
  stack?: string
}

type EncodedChildValue =
  | { kind: 'undefined' }
  | { kind: 'json'; value: unknown }
  | { kind: 'string'; value: string }

type ChildToParentMessage =
  | { type: 'stdout'; text: string }
  | { type: 'stderr'; text: string }
  | { type: 'callTool'; id: number; name: string; params?: unknown }
  | { type: 'done'; value: EncodedChildValue }
  | { type: 'error'; error: ChildErrorPayload }

type ParentToChildMessage =
  | { type: 'run'; script: string }
  | { type: 'cancel' }
  | { type: 'toolResult'; id: number; result: ToolResult }
  | { type: 'toolError'; id: number; error: ChildErrorPayload }

async function runScriptInChildProcess(input: RunScriptInChildProcessInput): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', EXECUTE_CODE_CHILD_SOURCE], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    })
    const executionAbort = new AbortController()
    let settled = false
    let toolCallsStarted = 0
    let timer: NodeJS.Timeout | undefined
    let killTimer: NodeJS.Timeout | undefined

    const sendToChild = (message: ParentToChildMessage) => {
      if (!child.connected || settled) {
        return
      }
      child.send(message, (error) => {
        if (error && !settled) {
          settleWithError(error)
        }
      })
    }

    const terminateChild = () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        return
      }
      child.kill('SIGTERM')
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL')
        }
      }, 250)
      killTimer.unref()
    }

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer)
      }
      if (killTimer) {
        clearTimeout(killTimer)
      }
      input.signal.removeEventListener('abort', onAbort)
      child.removeAllListeners('message')
      child.removeAllListeners('error')
      child.removeAllListeners('exit')
    }

    const settleWithError = (error: unknown) => {
      if (settled) {
        return
      }
      settled = true
      executionAbort.abort()
      cleanup()
      terminateChild()
      reject(error)
    }

    const settleWithValue = (value: unknown) => {
      if (settled) {
        return
      }
      settled = true
      if (child.connected) {
        child.disconnect()
      }
      cleanup()
      resolve(value)
    }

    const onAbort = () => {
      settleWithError(new Error('Execution cancelled'))
    }

    const handleToolCall = async (message: Extract<ChildToParentMessage, { type: 'callTool' }>) => {
      const toolParams = isRecord(message.params) ? message.params : {}

      try {
        throwIfAborted(executionAbort.signal)
        if (!input.allowedTools.has(message.name)) {
          throw new Error(`Tool "${message.name}" is not in allowedTools`)
        }
        if (message.name === 'execute_code') {
          throw new Error('execute_code cannot call itself')
        }
        if (toolCallsStarted >= input.maxToolCalls) {
          throw new Error(`maxToolCalls exceeded: ${input.maxToolCalls}`)
        }
        toolCallsStarted += 1

        const result = await input.invokeTool({
          name: message.name,
          params: toolParams,
          signal: executionAbort.signal,
        })
        throwIfAborted(executionAbort.signal)
        input.calls.push({ name: message.name, params: toolParams, result })
        sendToChild({ type: 'toolResult', id: message.id, result })
      } catch (error) {
        sendToChild({ type: 'toolError', id: message.id, error: serializeError(error) })
      }
    }

    const handleMessage = (rawMessage: unknown) => {
      if (settled || !isChildToParentMessage(rawMessage)) {
        return
      }

      switch (rawMessage.type) {
        case 'stdout':
          input.pushStdout(rawMessage.text)
          break
        case 'stderr':
          input.pushStderr(rawMessage.text)
          break
        case 'callTool':
          void handleToolCall(rawMessage)
          break
        case 'done':
          settleWithValue(decodeChildValue(rawMessage.value))
          break
        case 'error':
          settleWithError(deserializeError(rawMessage.error))
          break
      }
    }

    input.signal.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(
      () => settleWithError(new Error(`Execution timed out after ${input.timeoutMs}ms`)),
      input.timeoutMs,
    )
    child.on('message', handleMessage)
    child.on('error', settleWithError)
    child.on('exit', (code, signal) => {
      if (!settled) {
        settleWithError(
          new Error(
            signal
              ? `execute_code child process exited with signal ${signal}`
              : `execute_code child process exited with code ${code ?? 'unknown'}`,
          ),
        )
      }
    })

    try {
      throwIfAborted(input.signal)
      sendToChild({ type: 'run', script: input.script })
    } catch (error) {
      settleWithError(error)
    }
  })
}

interface OutputBudget {
  maxBytes: number
  usedBytes: number
  truncated: boolean
}

function createOutputBudget(maxBytes: number): OutputBudget {
  return { maxBytes, usedBytes: 0, truncated: false }
}

function captureOutput(target: string[], line: string, budget: OutputBudget): void {
  if (budget.usedBytes >= budget.maxBytes) {
    budget.truncated = true
    return
  }

  const remaining = budget.maxBytes - budget.usedBytes
  const lineBytes = Buffer.byteLength(line, 'utf8')
  if (lineBytes <= remaining) {
    target.push(line)
    budget.usedBytes += lineBytes
    return
  }

  budget.truncated = true
  const suffix = ' [truncated]'
  const safeRemaining = Math.max(0, remaining - Buffer.byteLength(suffix, 'utf8'))
  target.push(`${truncateUtf8(line, safeRemaining)}${suffix}`)
  budget.usedBytes = budget.maxBytes
}

function createResultDetail(
  value: unknown,
  maxBytes: number,
): { value: unknown; preview: string | undefined; truncated: boolean } {
  if (value === undefined) {
    return { value, preview: undefined, truncated: false }
  }

  const serialized = stringifyLogValue(value)
  if (Buffer.byteLength(serialized, 'utf8') <= maxBytes) {
    return { value, preview: serialized, truncated: false }
  }

  const preview = `${truncateUtf8(serialized, Math.max(0, maxBytes - 12))} [truncated]`
  return { value: preview, preview, truncated: true }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('Execution cancelled')
  }
}

function isChildToParentMessage(value: unknown): value is ChildToParentMessage {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false
  }
  switch (value.type) {
    case 'stdout':
    case 'stderr':
      return typeof value.text === 'string'
    case 'callTool':
      return typeof value.id === 'number' && typeof value.name === 'string'
    case 'done':
      return isEncodedChildValue(value.value)
    case 'error':
      return isChildErrorPayload(value.error)
    default:
      return false
  }
}

function isEncodedChildValue(value: unknown): value is EncodedChildValue {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return false
  }
  if (value.kind === 'undefined') {
    return true
  }
  if (value.kind === 'json') {
    return true
  }
  return value.kind === 'string' && typeof value.value === 'string'
}

function decodeChildValue(value: EncodedChildValue): unknown {
  if (value.kind === 'undefined') {
    return undefined
  }
  return value.value
}

function isChildErrorPayload(value: unknown): value is ChildErrorPayload {
  return (
    isRecord(value) &&
    typeof value.message === 'string' &&
    (value.stack === undefined || typeof value.stack === 'string')
  )
}

function serializeError(error: unknown): ChildErrorPayload {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack }
  }
  return { message: String(error) }
}

function deserializeError(error: ChildErrorPayload): Error {
  const value = new Error(error.message)
  if (error.stack) {
    value.stack = error.stack
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

function truncateUtf8(value: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return ''
  }
  return Buffer.from(value, 'utf8').subarray(0, maxBytes).toString('utf8')
}

function formatExecuteCodeResult(input: {
  resultPreview: string | undefined
  resultTruncated: boolean
  stdout: string[]
  stderr: string[]
  outputTruncated: boolean
  calls: ProgrammaticToolCallResult[]
}): string {
  const lines = ['execute_code completed.']
  if (input.stdout.length > 0) {
    lines.push('', 'Stdout:', ...input.stdout.map((line) => `- ${line}`))
  }
  if (input.stderr.length > 0) {
    lines.push('', 'Stderr:', ...input.stderr.map((line) => `- ${line}`))
  }
  if (input.outputTruncated) {
    lines.push('', 'Output truncated by maxOutputBytes.')
  }
  lines.push('', `Tool calls: ${input.calls.length}`)
  for (const call of input.calls) {
    lines.push(`- ${call.name}: ${call.result.isError ? 'error' : 'ok'}`)
  }
  if (input.resultPreview !== undefined) {
    const suffix = input.resultTruncated ? ' (truncated)' : ''
    lines.push('', `Return${suffix}: ${input.resultPreview}`)
  }
  return lines.join('\n')
}

const EXECUTE_CODE_CHILD_SOURCE = String.raw`
'use strict'

const vm = require('node:vm')

let cancelled = false
let nextToolCallId = 1
const pendingToolCalls = new Map()

process.on('message', async (message) => {
  if (!message || typeof message !== 'object') {
    return
  }

  if (message.type === 'cancel') {
    cancelled = true
    for (const pending of pendingToolCalls.values()) {
      pending.reject(new Error('Execution cancelled'))
    }
    pendingToolCalls.clear()
    return
  }

  if (message.type === 'toolResult' || message.type === 'toolError') {
    const pending = pendingToolCalls.get(message.id)
    if (!pending) {
      return
    }
    pendingToolCalls.delete(message.id)
    if (message.type === 'toolError') {
      pending.reject(deserializeError(message.error))
    } else {
      pending.resolve(message.result)
    }
    return
  }

  if (message.type === 'run') {
    await runScript(String(message.script ?? ''))
  }
})

async function runScript(scriptSource) {
  try {
    const context = vm.createContext({
      rpc: {
        callTool(name, params = {}) {
          if (cancelled) {
            return Promise.reject(new Error('Execution cancelled'))
          }
          return new Promise((resolve, reject) => {
            const id = nextToolCallId++
            pendingToolCalls.set(id, { resolve, reject })
            send({ type: 'callTool', id, name: String(name), params })
          })
        },
        isCancelled() {
          return cancelled
        },
        throwIfCancelled() {
          if (cancelled) {
            throw new Error('Execution cancelled')
          }
        },
      },
      console: {
        log(...values) {
          send({ type: 'stdout', text: formatConsole(values) })
        },
        info(...values) {
          send({ type: 'stdout', text: formatConsole(values) })
        },
        warn(...values) {
          send({ type: 'stderr', text: formatConsole(values) })
        },
        error(...values) {
          send({ type: 'stderr', text: formatConsole(values) })
        },
      },
    })
    const script = new vm.Script('"use strict"; (async () => {\n' + scriptSource + '\n})()')
    const value = await Promise.resolve(script.runInContext(context, { timeout: 1000 }))
    send({ type: 'done', value: encodeValue(value) })
  } catch (error) {
    send({ type: 'error', error: serializeError(error) })
  }
}

function send(message) {
  if (process.send) {
    process.send(message)
  }
}

function formatConsole(values) {
  return values.map((value) => stringifyValue(value)).join(' ')
}

function stringifyValue(value) {
  if (typeof value === 'string') {
    return value
  }
  try {
    const serialized = JSON.stringify(value)
    return serialized === undefined ? String(value) : serialized
  } catch {
    return String(value)
  }
}

function encodeValue(value) {
  if (value === undefined) {
    return { kind: 'undefined' }
  }

  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) {
      return { kind: 'string', value: String(value) }
    }
    return { kind: 'json', value: JSON.parse(serialized) }
  } catch {
    return { kind: 'string', value: String(value) }
  }
}

function serializeError(error) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack }
  }
  return { message: String(error) }
}

function deserializeError(error) {
  const value = new Error(error && typeof error.message === 'string' ? error.message : String(error))
  if (error && typeof error.stack === 'string') {
    value.stack = error.stack
  }
  return value
}
`

import { spawn } from 'node:child_process'
import { defineHook } from '../../hook-spec'

import type { HookSpec } from '../../hook-spec'
import type { HookInput, ToolExecuteBeforeInput, ToolExecuteBeforeOutput } from '../../types'

export interface CommandHookMatcher {
  tools?: string[]
  agents?: string[]
}

export interface CommandHookConfig {
  name: string
  command: string
  timing?: 'tool.execute.before'
  matcher?: CommandHookMatcher
  env?: Record<string, string>
  timeoutMs?: number
  timeout_ms?: number
  priority?: number
  enabled?: boolean
  cancelOnNonZeroExit?: boolean
  cancel_on_non_zero_exit?: boolean
}

export interface CommandHookRunInput {
  name: string
  command: string
  timing: 'tool.execute.before'
  payload: {
    input: ToolExecuteBeforeInput
    output: ToolExecuteBeforeOutput
  }
  env?: Record<string, string>
  timeoutMs: number
}

export interface CommandHookRunResult {
  exitCode: number | null
  signal?: string | null
  stdout: string
  stderr: string
  timedOut?: boolean
}

export type CommandHookRunner = (input: CommandHookRunInput) => Promise<CommandHookRunResult>

const DEFAULT_TIMEOUT_MS = 5000

export function createCommandHook(
  config: CommandHookConfig,
  runner: CommandHookRunner = runCommandHook,
): HookSpec {
  if (config.timing && config.timing !== 'tool.execute.before') {
    throw new Error(`Unsupported command hook timing: ${config.timing}`)
  }

  const timing = 'tool.execute.before' as const
  const timeoutMs = config.timeoutMs ?? config.timeout_ms ?? DEFAULT_TIMEOUT_MS
  const cancelOnNonZeroExit = config.cancelOnNonZeroExit ?? config.cancel_on_non_zero_exit ?? false

  return defineHook({
    name: config.name,
    timing,
    priority: config.priority ?? 40,
    enabled: config.enabled ?? true,
    async handle(input, output) {
      if (!matchesCommandHook(config.matcher, input)) {
        return
      }

      const result = await runner({
        name: config.name,
        command: config.command,
        timing,
        payload: { input, output },
        env: config.env,
        timeoutMs,
      })

      if (result.timedOut) {
        output.cancelled = true
        output.cancelReason = `Command hook "${config.name}" timed out after ${timeoutMs}ms`
        return
      }

      if (cancelOnNonZeroExit && result.exitCode !== 0) {
        output.cancelled = true
        output.cancelReason = formatCommandHookFailure(config.name, result)
      }
    },
  })
}

function matchesCommandHook(
  matcher: CommandHookMatcher | undefined,
  input: HookInput<'tool.execute.before'>,
): boolean {
  if (!matcher) {
    return true
  }

  if (matcher.tools && matcher.tools.length > 0 && !matcher.tools.includes(input.toolName)) {
    return false
  }

  if (matcher.agents && matcher.agents.length > 0 && !matcher.agents.includes(input.agentName)) {
    return false
  }

  return true
}

function formatCommandHookFailure(name: string, result: CommandHookRunResult): string {
  const detail = result.stderr.trim() || result.stdout.trim()
  if (detail) {
    return `Command hook "${name}" rejected tool execution: ${detail}`
  }

  return `Command hook "${name}" rejected tool execution with exit code ${String(result.exitCode)}`
}

async function runCommandHook(input: CommandHookRunInput): Promise<CommandHookRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, {
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...input.env,
        X_MARS_HOOK_NAME: input.name,
        X_MARS_HOOK_TIMING: input.timing,
      },
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, input.timeoutMs)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })

    child.on('error', (error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      reject(error)
    })

    child.on('close', (exitCode, signal) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve({ exitCode, signal, stdout, stderr, timedOut })
    })

    child.stdin.end(JSON.stringify(input.payload))
  })
}

export function isCommandHookConfig(value: unknown): value is CommandHookConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const candidate = value as Record<string, unknown>
  return typeof candidate.name === 'string' && typeof candidate.command === 'string'
}

import { describe, expect, it } from 'vitest'

import { createCommandHook } from '../src/core/command'
import { createHookRegistry } from '../src/hook-registry'

import type { CommandHookRunner } from '../src/core/command'
import type { ToolExecuteBeforeInput, ToolExecuteBeforeOutput } from '../src/types'

function createToolInput(overrides: Partial<ToolExecuteBeforeInput> = {}): ToolExecuteBeforeInput {
  return {
    toolName: 'bash',
    toolCallId: 'call-1',
    args: { command: 'git status' },
    agentName: 'default',
    sessionId: 'session-1',
    ...overrides,
  }
}

function createToolOutput(): ToolExecuteBeforeOutput {
  return {
    args: { command: 'git status' },
    cancelled: false,
  }
}

describe('CommandHook', () => {
  it('passes tool execution payload to the configured runner', async () => {
    const calls: Parameters<CommandHookRunner>[0][] = []
    const runner: CommandHookRunner = async (input) => {
      calls.push(input)
      return { exitCode: 0, stdout: 'ok', stderr: '' }
    }
    const registry = createHookRegistry()

    registry.register(
      createCommandHook(
        {
          name: 'audit-bash',
          command: 'node ./audit.js',
          matcher: { tools: ['bash'], agents: ['default'] },
          env: { AUDIT_MODE: '1' },
          timeoutMs: 250,
        },
        runner,
      ),
    )

    const input = createToolInput()
    const output = createToolOutput()
    await registry.execute('tool.execute.before', input, output)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      name: 'audit-bash',
      command: 'node ./audit.js',
      timing: 'tool.execute.before',
      env: { AUDIT_MODE: '1' },
      timeoutMs: 250,
    })
    expect(calls[0]?.payload.input).toEqual(input)
    expect(calls[0]?.payload.output).toEqual(output)
    expect(output.cancelled).toBe(false)
  })

  it('skips the runner when matcher does not match the tool or agent', async () => {
    let callCount = 0
    const runner: CommandHookRunner = async () => {
      callCount += 1
      return { exitCode: 0, stdout: 'ok', stderr: '' }
    }
    const registry = createHookRegistry()

    registry.register(
      createCommandHook(
        {
          name: 'only-edit',
          command: 'node ./audit.js',
          matcher: { tools: ['edit'], agents: ['reviewer'] },
        },
        runner,
      ),
    )

    const output = createToolOutput()
    await registry.execute('tool.execute.before', createToolInput(), output)

    expect(callCount).toBe(0)
    expect(output.cancelled).toBe(false)
  })

  it('cancels tool execution when configured and the command exits non-zero', async () => {
    const runner: CommandHookRunner = async () => ({
      exitCode: 2,
      stdout: '',
      stderr: 'not allowed',
    })
    const registry = createHookRegistry()

    registry.register(
      createCommandHook(
        {
          name: 'deny-bash',
          command: 'node ./deny.js',
          cancelOnNonZeroExit: true,
        },
        runner,
      ),
    )

    const output = createToolOutput()
    await registry.execute('tool.execute.before', createToolInput(), output)

    expect(output.cancelled).toBe(true)
    expect(output.cancelReason).toContain('not allowed')
  })

  it('cancels tool execution when the runner reports a timeout', async () => {
    const runner: CommandHookRunner = async () => ({
      exitCode: null,
      signal: 'SIGTERM',
      stdout: '',
      stderr: '',
      timedOut: true,
    })
    const registry = createHookRegistry()

    registry.register(
      createCommandHook(
        {
          name: 'slow-hook',
          command: 'node ./slow.js',
          timeout_ms: 10,
        },
        runner,
      ),
    )

    const output = createToolOutput()
    await registry.execute('tool.execute.before', createToolInput(), output)

    expect(output.cancelled).toBe(true)
    expect(output.cancelReason).toContain('timed out after 10ms')
  })

  it('rejects unsupported command hook timings at registration time', () => {
    expect(() =>
      createCommandHook({
        name: 'bad',
        command: 'node ./bad.js',
        timing: 'tool.execute.after' as never,
      }),
    ).toThrow('Unsupported command hook timing')
  })
})

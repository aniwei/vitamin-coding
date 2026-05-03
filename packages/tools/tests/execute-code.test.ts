import { describe, expect, it } from 'vitest'

import { createExecuteCode } from '../src/code'

const signal = new AbortController().signal

describe('execute_code tool', () => {
  it('throws when programmatic invoker is missing', async () => {
    const tool = createExecuteCode()

    await expect(
      tool.execute({
        id: 'ec0',
        params: {
          script: `return 1`,
          allowedTools: ['read'],
        },
        signal,
      }),
    ).rejects.toThrow('Programmatic tool invoker is not provided in options')
  })

  it('calls whitelisted tools through rpc.callTool', async () => {
    const calls: Array<{ name: string; params: Record<string, unknown> }> = []
    const tool = createExecuteCode({
      invokeTool: async (call) => {
        calls.push(call)
        return { content: [{ type: 'text', text: `ok:${call.name}` }] }
      },
    })

    const result = await tool.execute({
      id: 'ec1',
      params: {
        script: `
const result = await rpc.callTool('read', { path: 'package.json' })
console.log(result.content[0].text)
return { done: true }
`,
        allowedTools: ['read'],
        maxToolCalls: 2,
      },
      signal,
    })

    expect(result.isError).toBeUndefined()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ name: 'read', params: { path: 'package.json' } })
    expect(calls[0]?.signal?.aborted).toBe(false)
    expect(result.content[0]?.text).toContain('Tool calls: 1')
    expect(result.content[0]?.text).toContain('Return: {"done":true}')
    expect(result.details?.executionMode).toBe('child_process')
    expect(result.details?.stdout).toEqual(['ok:read'])
  })

  it('captures stdout and stderr separately', async () => {
    const tool = createExecuteCode({
      invokeTool: async () => ({ content: [{ type: 'text', text: 'unused' }] }),
    })

    const result = await tool.execute({
      id: 'ec-stdio',
      params: {
        script: `
console.log('hello', { ok: true })
console.warn('careful')
console.error('failed-ish')
return 'done'
`,
        allowedTools: ['read'],
      },
      signal,
    })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('Stdout:')
    expect(result.content[0]?.text).toContain('Stderr:')
    expect(result.details?.stdout).toEqual(['hello {"ok":true}'])
    expect(result.details?.stderr).toEqual(['careful', 'failed-ish'])
  })

  it('caps captured output and return value details', async () => {
    const tool = createExecuteCode({
      invokeTool: async () => ({ content: [{ type: 'text', text: 'unused' }] }),
    })

    const result = await tool.execute({
      id: 'ec-output-budget',
      params: {
        script: `
console.log('x'.repeat(2000))
return 'y'.repeat(2000)
`,
        allowedTools: ['read'],
        maxOutputBytes: 1024,
        maxResultBytes: 1024,
      },
      signal,
    })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('Output truncated by maxOutputBytes.')
    expect(result.content[0]?.text).toContain('Return (truncated):')
    expect(result.details?.outputTruncated).toBe(true)
    expect(result.details?.resultTruncated).toBe(true)
    expect(Buffer.byteLength(String(result.details?.result), 'utf8')).toBeLessThanOrEqual(1036)
  })

  it('keeps small structured return values in details', async () => {
    const tool = createExecuteCode({
      invokeTool: async () => ({ content: [{ type: 'text', text: 'unused' }] }),
    })

    const result = await tool.execute({
      id: 'ec-small-result',
      params: {
        script: `return { ok: true, count: 2 }`,
        allowedTools: ['read'],
      },
      signal,
    })

    expect(result.details?.result).toEqual({ ok: true, count: 2 })
    expect(result.details?.resultPreview).toBe('{"ok":true,"count":2}')
    expect(result.details?.resultTruncated).toBe(false)
  })

  it('terminates runaway scripts through the child process boundary', async () => {
    const tool = createExecuteCode({
      invokeTool: async () => ({ content: [{ type: 'text', text: 'unused' }] }),
    })
    const startedAt = Date.now()

    const result = await tool.execute({
      id: 'ec-timeout',
      params: {
        script: `while (true) {}`,
        allowedTools: ['read'],
        timeoutMs: 100,
      },
      signal,
    })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('Execution timed out after 100ms')
    expect(result.details?.executionMode).toBe('child_process')
    expect(Date.now() - startedAt).toBeLessThan(1500)
  })

  it('rejects tools outside the whitelist', async () => {
    const tool = createExecuteCode({
      invokeTool: async () => ({ content: [{ type: 'text', text: 'unexpected' }] }),
    })

    const result = await tool.execute({
      id: 'ec2',
      params: {
        script: `await rpc.callTool('write', { path: 'x', content: 'x' })`,
        allowedTools: ['read'],
      },
      signal,
    })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('Tool "write" is not in allowedTools')
  })

  it('enforces maxToolCalls', async () => {
    const tool = createExecuteCode({
      invokeTool: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    })

    const result = await tool.execute({
      id: 'ec3',
      params: {
        script: `
await rpc.callTool('read', { path: 'a' })
await rpc.callTool('read', { path: 'b' })
`,
        allowedTools: ['read'],
        maxToolCalls: 1,
      },
      signal,
    })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('maxToolCalls exceeded: 1')
  })

  it('propagates cancellation to subtool calls', async () => {
    const abortController = new AbortController()
    let childSignal: AbortSignal | undefined
    let resolveChildSignal: ((signal: AbortSignal) => void) | undefined
    const childSignalPromise = new Promise<AbortSignal>((resolve) => {
      resolveChildSignal = resolve
    })
    const tool = createExecuteCode({
      invokeTool: async (call) => {
        childSignal = call.signal
        if (call.signal) {
          resolveChildSignal?.(call.signal)
        }
        await new Promise((_resolve, reject) => {
          call.signal?.addEventListener('abort', () => reject(new Error('child aborted')), {
            once: true,
          })
        })
        return { content: [{ type: 'text', text: 'never' }] }
      },
    })

    const resultPromise = tool.execute({
      id: 'ec-cancel',
      params: {
        script: `await rpc.callTool('read', { path: 'package.json' })`,
        allowedTools: ['read'],
        timeoutMs: 30_000,
      },
      signal: abortController.signal,
    })

    await childSignalPromise
    abortController.abort()
    const result = await resultPromise

    expect(childSignal?.aborted).toBe(true)
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toMatch(/child aborted|Execution cancelled/)
  })
})

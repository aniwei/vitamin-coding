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
    expect(calls).toEqual([{ name: 'read', params: { path: 'package.json' } }])
    expect(result.content[0]?.text).toContain('Tool calls: 1')
    expect(result.content[0]?.text).toContain('Return: {"done":true}')
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
})

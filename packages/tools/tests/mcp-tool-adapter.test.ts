// @x-mars/tools MCP Tool Adapter 测试
// 测试 JSON Schema → Zod 转换、MCP 内容映射、AgentTool 适配

import { describe, expect, it } from 'vitest'

import { createMcpToolAdapter, createMcpToolAdapters } from '@x-mars/mcp'
import type { McpClient, McpToolDefinition, McpToolCallResult } from '@x-mars/mcp'

// ─── 辅助函数 ───

// 创建一个最小化可控的 McpClient stub（不 mock 任何方法，而是提供真实数据结构）
function createClientStub(
  serverName: string,
  tools: McpToolDefinition[],
  callResult?: McpToolCallResult,
): McpClient {
  return {
    serverName,
    getStatus: () => 'ready',
    getTools: () => tools,
    getServerInfo: () => null,
    onToolsChanged: () => {},
    callTool: async () =>
      callResult ?? { content: [{ type: 'text', text: 'stub result' }] },
    connect: async () => {},
    disconnect: async () => {},
    refreshTools: async () => tools,
  } as unknown as McpClient
}

// ─── 测试 ───

describe('MCP Tool Adapter', () => {
  describe('#createMcpToolAdapter — 基本适配', () => {
    it('#then 适配后的工具名使用 mcp__{server}__{tool} 格式', () => {
      const tool: McpToolDefinition = {
        name: 'search',
        description: 'Search for documents',
        inputSchema: { type: 'object', properties: {} },
      }
      const client = createClientStub('my-server', [tool])
      const adapted = createMcpToolAdapter(client, tool, 'my-server')

      expect(adapted.name).toBe('mcp__my-server__search')
    })

    it('#then description 包含 [MCP: serverName] 前缀', () => {
      const tool: McpToolDefinition = {
        name: 'query',
        description: 'Run a query',
        inputSchema: { type: 'object' },
      }
      const client = createClientStub('db', [tool])
      const adapted = createMcpToolAdapter(client, tool, 'db')

      expect(adapted.description).toBe('[MCP: db] Run a query')
    })

    it('#then 无 description 时使用工具名作为 fallback', () => {
      const tool: McpToolDefinition = {
        name: 'ping',
        inputSchema: { type: 'object' },
      }
      const client = createClientStub('util', [tool])
      const adapted = createMcpToolAdapter(client, tool, 'util')

      expect(adapted.description).toBe('[MCP: util] ping')
    })

    it('#then readOnlyHint 映射为 readonly 和并发安全', () => {
      const tool: McpToolDefinition = {
        name: 'read_file',
        inputSchema: { type: 'object' },
        annotations: { readOnlyHint: true },
      }
      const client = createClientStub('fs', [tool])
      const adapted = createMcpToolAdapter(client, tool, 'fs')

      expect(adapted.readonly).toBe(true)
      expect(adapted.isReadOnly?.({})).toBe(true)
      expect(adapted.isConcurrencySafe?.({})).toBe(true)
    })

    it('#then destructiveHint blocks readOnlyHint', () => {
      const tool: McpToolDefinition = {
        name: 'delete_file',
        inputSchema: { type: 'object' },
        annotations: { readOnlyHint: true, destructiveHint: true },
      }
      const client = createClientStub('fs', [tool])
      const adapted = createMcpToolAdapter(client, tool, 'fs')

      expect(adapted.readonly).toBe(false)
      expect(adapted.isReadOnly?.({})).toBe(false)
      expect(adapted.isConcurrencySafe?.({})).toBe(false)
    })
  })

  describe('#createMcpToolAdapter — 参数 schema 转换', () => {
    it('#then 空 inputSchema 转换为空 z.object', () => {
      const tool: McpToolDefinition = {
        name: 'empty',
        inputSchema: { type: 'object', properties: {} },
      }
      const client = createClientStub('s', [tool])
      const adapted = createMcpToolAdapter(client, tool, 's')

      const result = adapted.parameters.safeParse({})
      expect(result.success).toBe(true)
    })

    it('#then string 参数正确转换', () => {
      const tool: McpToolDefinition = {
        name: 'greet',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'User name' },
          },
          required: ['name'],
        },
      }
      const client = createClientStub('s', [tool])
      const adapted = createMcpToolAdapter(client, tool, 's')

      expect(adapted.parameters.safeParse({ name: 'Alice' }).success).toBe(true)
      expect(adapted.parameters.safeParse({ name: 123 }).success).toBe(false)
    })

    it('#then number/integer 参数正确转换', () => {
      const tool: McpToolDefinition = {
        name: 'calc',
        inputSchema: {
          type: 'object',
          properties: {
            count: { type: 'number' },
            index: { type: 'integer' },
          },
          required: ['count', 'index'],
        },
      }
      const client = createClientStub('s', [tool])
      const adapted = createMcpToolAdapter(client, tool, 's')

      expect(adapted.parameters.safeParse({ count: 3.14, index: 5 }).success).toBe(true)
      expect(adapted.parameters.safeParse({ count: 'abc', index: 1 }).success).toBe(false)
    })

    it('#then boolean 参数正确转换', () => {
      const tool: McpToolDefinition = {
        name: 'toggle',
        inputSchema: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
          },
          required: ['enabled'],
        },
      }
      const client = createClientStub('s', [tool])
      const adapted = createMcpToolAdapter(client, tool, 's')

      expect(adapted.parameters.safeParse({ enabled: true }).success).toBe(true)
      expect(adapted.parameters.safeParse({ enabled: 'yes' }).success).toBe(false)
    })

    it('#then enum 字段使用 z.enum 转换', () => {
      const tool: McpToolDefinition = {
        name: 'color',
        inputSchema: {
          type: 'object',
          properties: {
            color: { type: 'string', enum: ['red', 'green', 'blue'] },
          },
          required: ['color'],
        },
      }
      const client = createClientStub('s', [tool])
      const adapted = createMcpToolAdapter(client, tool, 's')

      expect(adapted.parameters.safeParse({ color: 'red' }).success).toBe(true)
      expect(adapted.parameters.safeParse({ color: 'yellow' }).success).toBe(false)
    })

    it('#then array 参数正确转换', () => {
      const tool: McpToolDefinition = {
        name: 'tags',
        inputSchema: {
          type: 'object',
          properties: {
            items: { type: 'array', items: { type: 'string' } },
          },
          required: ['items'],
        },
      }
      const client = createClientStub('s', [tool])
      const adapted = createMcpToolAdapter(client, tool, 's')

      expect(adapted.parameters.safeParse({ items: ['a', 'b'] }).success).toBe(true)
      expect(adapted.parameters.safeParse({ items: [1, 2] }).success).toBe(false)
    })

    it('#then 嵌套 object 参数正确转换', () => {
      const tool: McpToolDefinition = {
        name: 'nested',
        inputSchema: {
          type: 'object',
          properties: {
            config: {
              type: 'object',
              properties: {
                host: { type: 'string' },
                port: { type: 'number' },
              },
              required: ['host'],
            },
          },
          required: ['config'],
        },
      }
      const client = createClientStub('s', [tool])
      const adapted = createMcpToolAdapter(client, tool, 's')

      expect(adapted.parameters.safeParse({ config: { host: 'localhost', port: 8080 } }).success).toBe(true)
      expect(adapted.parameters.safeParse({ config: { host: 'localhost' } }).success).toBe(true)
      expect(adapted.parameters.safeParse({ config: {} }).success).toBe(false) // host is required
    })

    it('#then 可选参数省略时仍然通过校验', () => {
      const tool: McpToolDefinition = {
        name: 'search',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['query'],
        },
      }
      const client = createClientStub('s', [tool])
      const adapted = createMcpToolAdapter(client, tool, 's')

      expect(adapted.parameters.safeParse({ query: 'hello' }).success).toBe(true)
      expect(adapted.parameters.safeParse({ query: 'hello', limit: 10 }).success).toBe(true)
      expect(adapted.parameters.safeParse({}).success).toBe(false) // query is required
    })

    it('#then 无 properties 的 inputSchema 等价于 z.object({})', () => {
      const tool: McpToolDefinition = {
        name: 'noop',
        inputSchema: { type: 'object' },
      }
      const client = createClientStub('s', [tool])
      const adapted = createMcpToolAdapter(client, tool, 's')

      expect(adapted.parameters.safeParse({}).success).toBe(true)
    })
  })

  describe('#createMcpToolAdapter — execute 调用', () => {
    it('#then execute 返回 text 内容', async () => {
      const tool: McpToolDefinition = {
        name: 'echo',
        inputSchema: { type: 'object', properties: { msg: { type: 'string' } } },
      }
      const callResult: McpToolCallResult = {
        content: [{ type: 'text', text: 'Hello World' }],
      }
      const client = createClientStub('echo-server', [tool], callResult)
      const adapted = createMcpToolAdapter(client, tool, 'echo-server')

      const result = await adapted.execute({
        params: { msg: 'hi' },
        abortSignal: new AbortController().signal,
      } as never)

      expect(result.content).toHaveLength(1)
      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello World' })
    })

    it('#then execute 处理 image 内容', async () => {
      const tool: McpToolDefinition = {
        name: 'screenshot',
        inputSchema: { type: 'object' },
      }
      const callResult: McpToolCallResult = {
        content: [{ type: 'image', data: 'base64data', mimeType: 'image/png' }],
      }
      const client = createClientStub('viz', [tool], callResult)
      const adapted = createMcpToolAdapter(client, tool, 'viz')

      const result = await adapted.execute({
        params: {},
        abortSignal: new AbortController().signal,
      } as never)

      expect(result.content[0]).toEqual({
        type: 'image',
        mime: 'image/png',
        source: 'data:image/png;base64,base64data',
      })
    })

    it('#then execute 处理 resource 内容', async () => {
      const tool: McpToolDefinition = {
        name: 'fetch',
        inputSchema: { type: 'object' },
      }
      const callResult: McpToolCallResult = {
        content: [{ type: 'resource', resource: { uri: 'file:///tmp/data.txt', text: 'file content' } }],
      }
      const client = createClientStub('fs', [tool], callResult)
      const adapted = createMcpToolAdapter(client, tool, 'fs')

      const result = await adapted.execute({
        params: {},
        abortSignal: new AbortController().signal,
      } as never)

      expect(result.content[0]).toEqual({ type: 'text', text: 'file content' })
    })

    it('#then resource 无 text 时使用 URI 作为 fallback', async () => {
      const tool: McpToolDefinition = {
        name: 'fetch',
        inputSchema: { type: 'object' },
      }
      const callResult: McpToolCallResult = {
        content: [{ type: 'resource', resource: { uri: 'file:///tmp/data.bin' } }],
      }
      const client = createClientStub('fs', [tool], callResult)
      const adapted = createMcpToolAdapter(client, tool, 'fs')

      const result = await adapted.execute({
        params: {},
        abortSignal: new AbortController().signal,
      } as never)

      expect(result.content[0]).toEqual({ type: 'text', text: '[Resource: file:///tmp/data.bin]' })
    })

    it('#then 空 content 返回 (empty result)', async () => {
      const tool: McpToolDefinition = {
        name: 'void',
        inputSchema: { type: 'object' },
      }
      const callResult: McpToolCallResult = { content: [] }
      const client = createClientStub('s', [tool], callResult)
      const adapted = createMcpToolAdapter(client, tool, 's')

      const result = await adapted.execute({
        params: {},
        abortSignal: new AbortController().signal,
      } as never)

      expect(result.content).toHaveLength(1)
      expect(result.content[0]).toEqual({ type: 'text', text: '(empty result)' })
    })

    it('#then isError 标记正确传递', async () => {
      const tool: McpToolDefinition = {
        name: 'fail',
        inputSchema: { type: 'object' },
      }
      const callResult: McpToolCallResult = {
        content: [{ type: 'text', text: 'something went wrong' }],
        isError: true,
      }
      const client = createClientStub('s', [tool], callResult)
      const adapted = createMcpToolAdapter(client, tool, 's')

      const result = await adapted.execute({
        params: {},
        abortSignal: new AbortController().signal,
      } as never)

      expect(result.isError).toBe(true)
    })

    it('#then details 包含 mcpServer 和 mcpTool', async () => {
      const tool: McpToolDefinition = {
        name: 'query',
        inputSchema: { type: 'object' },
      }
      const callResult: McpToolCallResult = {
        content: [{ type: 'text', text: 'ok' }],
      }
      const client = createClientStub('my-db', [tool], callResult)
      const adapted = createMcpToolAdapter(client, tool, 'my-db')

      const result = await adapted.execute({
        params: {},
        abortSignal: new AbortController().signal,
      } as never)

      expect(result.details).toEqual({
        mcpServer: 'my-db',
        mcpTool: 'query',
      })
    })
  })

  describe('#createMcpToolAdapters — 批量适配', () => {
    it('#then 为 client 的所有工具创建适配器', () => {
      const tools: McpToolDefinition[] = [
        { name: 'read', inputSchema: { type: 'object' } },
        { name: 'write', inputSchema: { type: 'object' } },
        { name: 'delete', inputSchema: { type: 'object' } },
      ]
      const client = createClientStub('storage', tools)
      const adapted = createMcpToolAdapters(client, 'storage')

      expect(adapted).toHaveLength(3)
      expect(adapted.map((t) => t.name)).toEqual([
        'mcp__storage__read',
        'mcp__storage__write',
        'mcp__storage__delete',
      ])
    })

    it('#then 无工具的 client 返回空数组', () => {
      const client = createClientStub('empty', [])
      const adapted = createMcpToolAdapters(client, 'empty')
      expect(adapted).toHaveLength(0)
    })
  })
})

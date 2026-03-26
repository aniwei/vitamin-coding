// @vitamin/coding McpRuntime 测试
// 测试应用级 MCP 生命周期管理、ToolRegistry 自动注册/清理

import { describe, expect, it } from 'vitest'
import { McpRuntime, createMcpRuntime } from '../src/mcp-runtime'
import { ToolRegistry } from '@vitamin/tools'
import type { AgentTool } from '@vitamin/agent'

// 最小 AgentTool stub
function makeTool(name: string): AgentTool {
  return {
    name,
    description: `Tool: ${name}`,
    parameters: {
      safeParse(input: unknown) {
        return { success: true as const, data: input }
      },
    } as never,
    execute: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
  }
}

describe('McpRuntime', () => {
  describe('#createMcpRuntime factory', () => {
    it('#then creates McpRuntime instance', () => {
      const runtime = createMcpRuntime({ servers: {} })
      expect(runtime).toBeInstanceOf(McpRuntime)
    })
  })

  describe('#given no servers', () => {
    it('#then start succeeds and counts are 0', async () => {
      const runtime = createMcpRuntime({ servers: {} })
      await runtime.start({})

      expect(runtime.connectedCount).toBe(0)
      expect(runtime.toolCount).toBe(0)
      expect(runtime.getTools()).toHaveLength(0)
    })
  })

  describe('#stop without start', () => {
    it('#then resolves without error', async () => {
      const runtime = createMcpRuntime({ servers: {} })
      await runtime.stop()
    })
  })

  describe('#getManager', () => {
    it('#then returns the underlying McpManager', () => {
      const runtime = createMcpRuntime({ servers: {} })
      const manager = runtime.getManager()
      expect(manager).toBeDefined()
      expect(manager.connectedCount).toBe(0)
    })
  })

  describe('#getServerInfos with disabled servers', () => {
    it('#then includes disabled servers as disconnected', () => {
      const runtime = createMcpRuntime({
        servers: {},
        disabledServers: ['a', 'b'],
      })
      const infos = runtime.getServerInfos()
      expect(infos).toHaveLength(2)
      expect(infos[0]!.name).toBe('a')
      expect(infos[0]!.status).toBe('disconnected')
    })
  })

  describe('#ToolRegistry integration', () => {
    it('#then does not register tools when no toolRegistry provided', async () => {
      const runtime = createMcpRuntime({ servers: {} })
      await runtime.start({})
      // 无 registry，不应报错
      expect(runtime.getTools()).toHaveLength(0)
    })

    it('#then stop clears MCP tools from registry', async () => {
      const registry = new ToolRegistry()
      // 手动预注册一些 MCP 工具来模拟
      registry.register(makeTool('mcp__s__t1'), { preset: 'standard', category: 'mcp' })
      registry.register(makeTool('mcp__s__t2'), { preset: 'standard', category: 'mcp' })
      expect(registry.getByCategory('mcp')).toHaveLength(2)

      const runtime = createMcpRuntime({
        servers: {},
        toolRegistry: registry,
      })
      await runtime.start({})
      // start 会先 clear 再 sync — 但没有真实 MCP 连接，所以会清掉之前注册的
      expect(registry.getByCategory('mcp')).toHaveLength(0)

      await runtime.stop()
      expect(registry.getByCategory('mcp')).toHaveLength(0)
    })

    it('#then non-mcp tools in registry are unaffected', async () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('builtin-read'), { preset: 'minimal', category: 'filesystem' })
      registry.register(makeTool('mcp__s__x'), { preset: 'standard', category: 'mcp' })

      const runtime = createMcpRuntime({
        servers: {},
        toolRegistry: registry,
      })
      await runtime.start({})

      // builtin 工具不受影响
      expect(registry.has('builtin-read')).toBe(true)
      expect(registry.getByCategory('filesystem')).toHaveLength(1)
      // MCP 工具被 sync 清掉了（因为没有真实 MCP server）
      expect(registry.getByCategory('mcp')).toHaveLength(0)

      await runtime.stop()
      expect(registry.has('builtin-read')).toBe(true)
    })
  })

  describe('#start with failing server (skipOnError)', () => {
    it('#then silently skips invalid server', async () => {
      const runtime = createMcpRuntime({
        servers: { bad: { command: '__nonexistent_12345__' } },
      })

      await runtime.start({ bad: { command: '__nonexistent_12345__' } })
      expect(runtime.connectedCount).toBe(0)

      await runtime.stop()
    })
  })

  describe('#double start', () => {
    it('#then second start is no-op', async () => {
      const runtime = createMcpRuntime({ servers: {} })
      await runtime.start({})
      await runtime.start({}) // 不应报错
      expect(runtime.connectedCount).toBe(0)

      await runtime.stop()
    })
  })

  describe('#double stop', () => {
    it('#then second stop is no-op', async () => {
      const runtime = createMcpRuntime({ servers: {} })
      await runtime.start({})
      await runtime.stop()
      await runtime.stop() // 不应报错
    })
  })
})

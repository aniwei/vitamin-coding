import { describe, expect, it } from 'vitest'

import {
  createMcpAgentTools as createMcpAgentToolsFromMcp,
  createMcpClient as createMcpClientFromMcp,
  createMcpManager as createMcpManagerFromMcp,
  createMcpToolAdapter as createMcpToolAdapterFromMcp,
  createSseTransport as createSseTransportFromMcp,
  createStdioTransport as createStdioTransportFromMcp,
  McpClient as McpClientFromMcp,
  McpManager as McpManagerFromMcp,
  SseTransport as SseTransportFromMcp,
  StdioTransport as StdioTransportFromMcp,
} from '@x-mars/mcp'

import {
  createMcpAgentTools,
  createMcpClient,
  createMcpManager,
  createMcpToolAdapter,
  createSseTransport,
  createStdioTransport,
  McpClient,
  McpManager,
  SseTransport,
  StdioTransport,
} from '../src/mcp'
import {
  createMcpToolAdapter as createMcpToolAdapterFromCompatSubpath,
  mcpSchemaToZod,
} from '../src/mcp/mcp-tool-adapter'

describe('tools MCP compatibility exports', () => {
  it('#then root compatibility exports point to @x-mars/mcp implementations', () => {
    expect(McpClient).toBe(McpClientFromMcp)
    expect(createMcpClient).toBe(createMcpClientFromMcp)
    expect(McpManager).toBe(McpManagerFromMcp)
    expect(createMcpManager).toBe(createMcpManagerFromMcp)
    expect(createMcpToolAdapter).toBe(createMcpToolAdapterFromMcp)
    expect(createMcpAgentTools).toBe(createMcpAgentToolsFromMcp)
    expect(StdioTransport).toBe(StdioTransportFromMcp)
    expect(createStdioTransport).toBe(createStdioTransportFromMcp)
    expect(SseTransport).toBe(SseTransportFromMcp)
    expect(createSseTransport).toBe(createSseTransportFromMcp)
  })

  it('#then legacy subpath exports preserve adapter helpers', () => {
    expect(createMcpToolAdapterFromCompatSubpath).toBe(createMcpToolAdapterFromMcp)
    expect(typeof mcpSchemaToZod).toBe('function')
  })
})

// @vitamin/tools MCP 模块入口

export { McpClient, createMcpClient } from './mcp-client'
export type { McpClientOptions } from './mcp-client'

export { McpManager, createMcpManager } from './mcp-manager'
export type { McpManagerOptions } from './mcp-manager'

export { createMcpToolAdapter, createMcpToolAdapters } from './mcp-tool-adapter'

export { StdioTransport, SseTransport, createStdioTransport, createSseTransport } from './transport'
export type { McpTransport } from './transport'

export type {
  McpServerConfig,
  McpToolDefinition,
  McpToolCallParams,
  McpToolCallResult,
  McpContent,
  McpClientStatus,
  McpServerInfo,
  McpTransportType,
  McpJsonSchema,
  McpJsonSchemaProperty,
  McpServerCapabilities,
  McpInitializeResult,
} from './types'

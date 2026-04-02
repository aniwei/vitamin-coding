// @vitamin/tools MCP 模块入口
// 迁移至 @vitamin/mcp，此处保留 re-export 以保持向后兼容

export {
  McpClient,
  createMcpClient,
  McpManager,
  createMcpManager,
  createMcpToolAdapter,
  createMcpToolAdapters,
  StdioTransport,
  SseTransport,
} from '@vitamin/mcp'

export type {
  McpClientOptions,
  McpManagerOptions,
  McpTransport,
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
} from '@vitamin/mcp'

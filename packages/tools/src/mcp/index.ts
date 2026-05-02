// @x-mars/tools MCP 模块入口
// 迁移至 @x-mars/mcp，此处保留 re-export 以保持向后兼容

export {
  McpClient,
  createMcpClient,
  McpManager,
  createMcpManager,
  createMcpToolAdapter,
  createMcpToolAdapters,
  createMcpAgentTools,
  createMcpListResourcesTool,
  createMcpReadResourceTool,
  createMcpListPromptsTool,
  createMcpGetPromptTool,
  StdioTransport,
  SseTransport,
  createStdioTransport,
  createSseTransport,
} from '@x-mars/mcp'

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
  McpResource,
  McpResourceContents,
  McpPrompt,
  McpPromptMessage,
} from '@x-mars/mcp'

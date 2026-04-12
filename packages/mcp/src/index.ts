// @vitamin/mcp — MCP (Model Context Protocol) 模块
// 提供 MCP 客户端、服务端、工具适配、资源访问等完整能力

// ─── Types ───
export type {
  // JSON-RPC
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  JsonRpcError,
  // MCP Protocol
  McpServerCapabilities,
  McpClientCapabilities,
  McpInitializeParams,
  McpInitializeResult,
  // Tool
  McpToolDefinition,
  McpJsonSchema,
  McpJsonSchemaProperty,
  McpToolCallParams,
  McpToolCallResult,
  McpContent,
  McpTextContent,
  McpImageContent,
  McpResourceContent,
  // Resource
  McpResource,
  McpResourceTemplate,
  McpResourceContents,
  // Prompt
  McpPrompt,
  McpPromptArgument,
  McpPromptMessage,
  // Config
  McpServerConfig,
  McpTransportType,
  McpClientStatus,
  McpServerInfo,
  McpEvents,
} from './types'

// ─── Transport ───
export type { McpTransport } from './transport'
export { StdioTransport, SseTransport } from './transport'

// ─── Client ───
export { McpClient, createMcpClient } from './mcp-client'
export type { McpClientOptions } from './mcp-client'

// ─── Manager ───
export { McpManager, createMcpManager } from './mcp-manager'
export type { McpManagerOptions } from './mcp-manager'

// ─── Tool Adapter ───
export {
  createMcpToolAdapter,
  createMcpToolAdapters,
  jsonSchemaPropertyToZod,
  mcpSchemaToZod,
  mcpContentToToolContent,
} from './mcp-tool-adapter'

// ─── Resource ───
export { readMcpResource, findMcpResource, searchMcpResources } from './mcp-resource'
export type { McpResourceEntry } from './mcp-resource'

// ─── Server ───
export { VitaminMcpServer, createMcpServer } from './mcp-server'
export type { McpServerOptions } from './mcp-server'

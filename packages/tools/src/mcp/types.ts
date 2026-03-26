// MCP (Model Context Protocol) 类型定义
// 遵循 MCP 2024-11-05 规范

// ─── JSON-RPC 基础 ───

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: JsonRpcError
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

// ─── MCP 协议消息 ───

export interface McpServerCapabilities {
  tools?: { listChanged?: boolean }
  resources?: { subscribe?: boolean; listChanged?: boolean }
  prompts?: { listChanged?: boolean }
}

export interface McpClientCapabilities {
  roots?: { listChanged?: boolean }
  sampling?: Record<string, unknown>
}

export interface McpInitializeParams {
  protocolVersion: string
  capabilities: McpClientCapabilities
  clientInfo: { name: string; version: string }
}

export interface McpInitializeResult {
  protocolVersion: string
  capabilities: McpServerCapabilities
  serverInfo: { name: string; version?: string }
}

// ─── MCP Tool 定义 ───

export interface McpToolDefinition {
  name: string
  description?: string
  inputSchema: McpJsonSchema
}

export interface McpJsonSchema {
  type: string
  properties?: Record<string, McpJsonSchemaProperty>
  required?: string[]
  additionalProperties?: boolean
  [key: string]: unknown
}

export interface McpJsonSchemaProperty {
  type: string
  description?: string
  enum?: unknown[]
  default?: unknown
  items?: McpJsonSchemaProperty
  properties?: Record<string, McpJsonSchemaProperty>
  required?: string[]
  [key: string]: unknown
}

// ─── MCP Tool 调用 ───

export interface McpToolCallParams {
  name: string
  arguments?: Record<string, unknown>
}

export interface McpToolCallResult {
  content: McpContent[]
  isError?: boolean
}

export type McpContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource'; resource: { uri: string; text?: string; blob?: string; mimeType?: string } }

// ─── MCP 服务器配置 ───

export interface McpServerConfig {
  // stdio 模式
  command?: string
  args?: string[]
  env?: Record<string, string>
  // SSE / Streamable HTTP 模式
  url?: string
}

export type McpTransportType = 'stdio' | 'sse'

// ─── MCP Client 状态 ───

export type McpClientStatus = 'disconnected' | 'connecting' | 'ready' | 'error'

export interface McpServerInfo {
  name: string
  config: McpServerConfig
  status: McpClientStatus
  tools: McpToolDefinition[]
  error?: string
}

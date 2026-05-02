// MCP (Model Context Protocol) 类型定义
// 遵循 MCP 2024-11-05 规范
// 从 @x-mars/tools 迁移并增强

import type { Events } from '@x-mars/shared'

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
  instructions?: string
}

// ─── MCP Tool 定义 ───

export interface McpToolDefinition {
  name: string
  description?: string
  inputSchema: McpJsonSchema
  annotations?: McpToolAnnotations
}

export interface McpToolAnnotations {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
  [key: string]: unknown
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

export type McpContent = McpTextContent | McpImageContent | McpResourceContent

export interface McpTextContent {
  type: 'text'
  text: string
}

export interface McpImageContent {
  type: 'image'
  data: string
  mimeType: string
}

export interface McpResourceContent {
  type: 'resource'
  resource: {
    uri: string
    text?: string
    blob?: string
    mimeType?: string
  }
}

// ─── MCP Resource ───

export interface McpResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface McpResourceTemplate {
  uriTemplate: string
  name: string
  description?: string
  mimeType?: string
}

export interface McpResourceContents {
  uri: string
  mimeType?: string
  text?: string
  blob?: string
}

// ─── MCP Prompt ───

export interface McpPrompt {
  name: string
  description?: string
  arguments?: McpPromptArgument[]
}

export interface McpPromptArgument {
  name: string
  description?: string
  required?: boolean
}

export interface McpPromptMessage {
  role: 'user' | 'assistant'
  content: McpTextContent | McpImageContent | McpResourceContent
}

// ─── MCP 服务器配置 ───

export interface McpServerConfig {
  /** stdio 模式：命令 */
  command?: string
  /** stdio 模式：命令参数 */
  args?: string[]
  /** stdio 模式：环境变量 */
  env?: Record<string, string>
  /** SSE / Streamable HTTP 模式：URL */
  url?: string
  /** 请求超时（毫秒），覆盖 manager 级默认值 */
  requestTimeoutMs?: number
  /** 自动重连（默认 true） */
  autoReconnect?: boolean
  /** 最大重连次数（默认 3） */
  maxReconnectAttempts?: number
}

export type McpTransportType = 'stdio' | 'sse'

// ─── MCP Client 状态 ───

export type McpClientStatus = 'disconnected' | 'connecting' | 'ready' | 'error' | 'reconnecting'

export interface McpServerInfo {
  name: string
  config: McpServerConfig
  status: McpClientStatus
  tools: McpToolDefinition[]
  resources?: McpResource[]
  prompts?: McpPrompt[]
  instructions?: string
  capabilities?: McpServerCapabilities
  error?: string
}

// ─── MCP Events ───

export interface McpEvents extends Events {
  'server.connected': (info: { name: string; tools: number }) => void
  'server.disconnected': (info: { name: string; reason?: string }) => void
  'server.error': (info: { name: string; error: string }) => void
  'server.reconnecting': (info: { name: string; attempt: number }) => void
  'tools.changed': (info: { serverName: string; tools: McpToolDefinition[] }) => void
  'resources.changed': (info: { serverName: string }) => void
  'prompts.changed': (info: { serverName: string }) => void
}

/**
 * MCP (Model Context Protocol) types for the web UI.
 */

export type MCPServerStatus = 'connected' | 'disconnected' | 'connecting' | 'error'

export interface MCPServerConfig {
  command: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
  autoStart: boolean
}

export interface MCPServer {
  name: string
  status: MCPServerStatus
  config: MCPServerConfig
  toolsCount: number
  configLocation: 'global' | 'project'
  configPath: string
}

export interface MCPTool {
  name: string
  description: string
  inputSchema?: {
    type?: string
    properties?: Record<
      string,
      {
        type?: string
        description?: string
        enum?: string[]
        items?: any
        [key: string]: any
      }
    >
    required?: string[]
    [key: string]: any
  }
}

export interface MCPServerDetailed extends MCPServer {
  tools: MCPTool[]
  capabilities: string[]
}

export interface MCPServerCreateRequest {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  enabled?: boolean
  autoStart?: boolean
  projectConfig?: boolean
}

export interface MCPServerUpdateRequest {
  command?: string
  args?: string[]
  env?: Record<string, string>
  enabled?: boolean
  autoStart?: boolean
}

export interface MCPApiResponse {
  success: boolean
  message: string
  toolsCount?: number
}

export interface MCPServersResponse {
  servers: MCPServer[]
}

// WebSocket 事件类型
export interface MCPStatusChangedEvent {
  type: 'mcp:status_changed'
  data: {
    serverName: string
    status: MCPServerStatus
    toolsCount: number
  }
}

export interface MCPServersUpdatedEvent {
  type: 'mcp:servers_updated'
  data: {
    action: 'added' | 'removed' | 'updated'
    serverName: string
  }
}

export type MCPWebSocketEvent = MCPStatusChangedEvent | MCPServersUpdatedEvent

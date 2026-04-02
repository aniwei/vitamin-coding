// MCP 服务器管理 API 客户端

import type {
  MCPApiResponse,
  MCPServerCreateRequest,
  MCPServerDetailed,
  MCPServerUpdateRequest,
  MCPServersResponse,
} from '../types/mcp'

const API_BASE = '/api'

// 通用 API 请求辅助函数
async function fetchAPI<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(errorData.message || `API error: ${response.statusText}`)
  }

  return response.json()
}

// 列出所有已配置的 MCP 服务器及其状态
export async function listMCPServers(): Promise<MCPServersResponse> {
  return fetchAPI<MCPServersResponse>('/mcp/servers')
}

// 获取指定 MCP 服务器的详细信息
export async function getMCPServer(name: string): Promise<MCPServerDetailed> {
  return fetchAPI<MCPServerDetailed>(`/mcp/servers/${encodeURIComponent(name)}`)
}

// 连接到 MCP 服务器
export async function connectMCPServer(name: string): Promise<MCPApiResponse> {
  return fetchAPI<MCPApiResponse>(`/mcp/servers/${encodeURIComponent(name)}/connect`, {
    method: 'POST',
  })
}

// 断开与 MCP 服务器的连接
export async function disconnectMCPServer(name: string): Promise<MCPApiResponse> {
  return fetchAPI<MCPApiResponse>(`/mcp/servers/${encodeURIComponent(name)}/disconnect`, {
    method: 'POST',
  })
}

// 测试 MCP 服务器连接
export async function testMCPServer(name: string): Promise<MCPApiResponse> {
  return fetchAPI<MCPApiResponse>(`/mcp/servers/${encodeURIComponent(name)}/test`, {
    method: 'POST',
  })
}

// 创建新的 MCP 服务器配置
export async function createMCPServer(server: MCPServerCreateRequest): Promise<MCPApiResponse> {
  return fetchAPI<MCPApiResponse>('/mcp/servers', {
    method: 'POST',
    body: JSON.stringify(server),
  })
}

// 更新已有的 MCP 服务器配置
export async function updateMCPServer(
  name: string,
  update: MCPServerUpdateRequest,
): Promise<MCPApiResponse> {
  return fetchAPI<MCPApiResponse>(`/mcp/servers/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify(update),
  })
}

// 删除 MCP 服务器配置
export async function deleteMCPServer(name: string): Promise<MCPApiResponse> {
  return fetchAPI<MCPApiResponse>(`/mcp/servers/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

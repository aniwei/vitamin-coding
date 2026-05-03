// MCP 服务器管理 API 客户端

import type {
  MCPApiResponse,
  MCPServerCreateRequest,
  MCPServerDetailed,
  MCPServerUpdateRequest,
  MCPServersResponse,
} from '../types/mcp'
import { deleteJson, getJson, postJson, putJson } from './core'

export async function listMCPServers(): Promise<MCPServersResponse> {
  return getJson<MCPServersResponse>('/mcp/servers', { normalizeCamel: true })
}

export async function getMCPServer(name: string): Promise<MCPServerDetailed> {
  return getJson<MCPServerDetailed>(`/mcp/servers/${encodeURIComponent(name)}`, {
    normalizeCamel: true,
  })
}

export async function connectMCPServer(name: string): Promise<MCPApiResponse> {
  return postJson<MCPApiResponse>(`/mcp/servers/${encodeURIComponent(name)}/connect`, undefined, {
    normalizeCamel: true,
  })
}

export async function disconnectMCPServer(name: string): Promise<MCPApiResponse> {
  return postJson<MCPApiResponse>(
    `/mcp/servers/${encodeURIComponent(name)}/disconnect`,
    undefined,
    {
      normalizeCamel: true,
    },
  )
}

export async function testMCPServer(name: string): Promise<MCPApiResponse> {
  return postJson<MCPApiResponse>(`/mcp/servers/${encodeURIComponent(name)}/test`, undefined, {
    normalizeCamel: true,
  })
}

export async function createMCPServer(server: MCPServerCreateRequest): Promise<MCPApiResponse> {
  return postJson<MCPApiResponse>('/mcp/servers', server, { normalizeCamel: true })
}

export async function updateMCPServer(
  name: string,
  update: MCPServerUpdateRequest,
): Promise<MCPApiResponse> {
  return putJson<MCPApiResponse>(`/mcp/servers/${encodeURIComponent(name)}`, update, {
    normalizeCamel: true,
  })
}

// 删除 MCP 服务器配置
export async function deleteMCPServer(name: string): Promise<MCPApiResponse> {
  return deleteJson<MCPApiResponse>(`/mcp/servers/${encodeURIComponent(name)}`, {
    normalizeCamel: true,
  })
}

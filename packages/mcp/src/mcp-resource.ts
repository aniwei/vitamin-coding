// MCP Resource 访问辅助
// 提供跨 server 的 resource 查询和读取接口

import type { McpManager } from './mcp-manager'
import type { McpResource, McpResourceContents } from './types'

export interface McpResourceEntry extends McpResource {
  serverName: string
}

/**
 * 读取指定 server 上的 MCP 资源
 */
export async function readMcpResource(
  manager: McpManager,
  serverName: string,
  uri: string,
): Promise<McpResourceContents[]> {
  const client = manager.getClient(serverName)
  if (!client) {
    throw new Error(`MCP server "${serverName}" not found`)
  }
  return client.readResource(uri)
}

/**
 * 按 URI 匹配查找资源（跨所有 server）
 */
export function findMcpResource(
  manager: McpManager,
  uri: string,
): McpResourceEntry | undefined {
  const all = manager.getAllResources()
  return all.find((r) => r.uri === uri)
}

/**
 * 按名称或描述模糊搜索资源
 */
export function searchMcpResources(
  manager: McpManager,
  query: string,
): McpResourceEntry[] {
  const lowerQuery = query.toLowerCase()
  const all = manager.getAllResources()

  return all.filter((r) => {
    const name = r.name.toLowerCase()
    const desc = (r.description ?? '').toLowerCase()
    return name.includes(lowerQuery) || desc.includes(lowerQuery)
  })
}

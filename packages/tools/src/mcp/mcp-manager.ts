// MCP Manager — 管理多个 MCP Server 连接的生命周期
// 创建 Client → 连接 → 提取 AgentTool

import { createLogger } from '@vitamin/shared'
import { McpClient, createMcpClient } from './mcp-client'
import { createMcpToolAdapters } from './mcp-tool-adapter'
import type { McpServerConfig, McpServerInfo, McpClientStatus } from './types'
import type { AgentTool } from '@vitamin/agent'

const logger = createLogger('@vitamin/tools:mcp-manager')

export interface McpManagerOptions {
  // 每个 MCP 请求超时
  requestTimeoutMs?: number
  // 连接失败时是否静默跳过（默认 true）
  skipOnError?: boolean
}

export class McpManager {
  private clients = new Map<string, McpClient>()
  private options: McpManagerOptions
  private disabledServers: Set<string>
  private toolsChangedCallback: (() => void) | null = null

  constructor(options: McpManagerOptions = {}, disabledServers: string[] = []) {
    this.options = options
    this.disabledServers = new Set(disabledServers)
  }

  // 注册工具列表变更回调（Manager 层面，当任何 server tools 变化时触发）
  onToolsChanged(callback: () => void): void {
    this.toolsChangedCallback = callback
  }

  // 从配置初始化所有 MCP Server
  async connectAll(servers: Record<string, McpServerConfig>): Promise<void> {
    const entries = Object.entries(servers)
    if (entries.length === 0) return

    logger.info('Connecting to %d MCP servers...', entries.length)

    const results = await Promise.allSettled(
      entries.map(([name, config]) => this.connect(name, config)),
    )

    let connected = 0
    let failed = 0
    for (const result of results) {
      if (result.status === 'fulfilled') {
        connected++
      } else {
        failed++
      }
    }

    logger.info('MCP servers: %d connected, %d failed', connected, failed)
  }

  // 连接单个 MCP Server
  async connect(name: string, config: McpServerConfig): Promise<void> {
    if (this.disabledServers.has(name)) {
      logger.info('MCP server "%s" is disabled, skipping', name)
      return
    }

    // 如果已连接，先断开
    if (this.clients.has(name)) {
      await this.disconnect(name)
    }

    const client = createMcpClient(name, config, {
      requestTimeoutMs: this.options.requestTimeoutMs,
    })

    // 监听工具列表变化
    client.onToolsChanged(() => {
      logger.info('MCP server "%s" tools changed, notifying manager', name)
      this.toolsChangedCallback?.()
    })

    try {
      await client.connect()
      this.clients.set(name, client)
    } catch (err) {
      if (this.options.skipOnError !== false) {
        logger.warn('MCP server "%s" connection failed, skipping: %s', name, (err as Error).message)
      } else {
        throw err
      }
    }
  }

  // 断开单个 MCP Server
  async disconnect(name: string): Promise<void> {
    const client = this.clients.get(name)
    if (client) {
      await client.disconnect()
      this.clients.delete(name)
    }
  }

  // 断开所有连接
  async disconnectAll(): Promise<void> {
    const names = [...this.clients.keys()]
    await Promise.allSettled(names.map((name) => this.disconnect(name)))
  }

  // 获取所有可用 MCP 工具（已转换为 AgentTool）
  getAllTools(): AgentTool[] {
    const tools: AgentTool[] = []
    for (const [name, client] of this.clients) {
      if (client.getStatus() === 'ready') {
        tools.push(...createMcpToolAdapters(client, name))
      }
    }
    return tools
  }

  // 获取所有 MCP Server 的状态信息
  getServerInfos(): McpServerInfo[] {
    const infos: McpServerInfo[] = []

    for (const [name, client] of this.clients) {
      infos.push({
        name,
        config: {} as McpServerConfig, // 不暴露内部配置细节
        status: client.getStatus(),
        tools: client.getTools(),
        error: client.getStatus() === 'error' ? `Connection failed` : undefined,
      })
    }

    // 添加已禁用的 server
    for (const name of this.disabledServers) {
      if (!this.clients.has(name)) {
        infos.push({
          name,
          config: {} as McpServerConfig,
          status: 'disconnected' as McpClientStatus,
          tools: [],
        })
      }
    }

    return infos
  }

  // 获取已连接 server 数量
  get connectedCount(): number {
    let count = 0
    for (const client of this.clients.values()) {
      if (client.getStatus() === 'ready') count++
    }
    return count
  }

  // 获取 MCP 工具总数
  get toolCount(): number {
    let count = 0
    for (const client of this.clients.values()) {
      if (client.getStatus() === 'ready') {
        count += client.getTools().length
      }
    }
    return count
  }
}

export function createMcpManager(
  options?: McpManagerOptions,
  disabledServers?: string[],
): McpManager {
  return new McpManager(options, disabledServers)
}

// MCP Manager — 管理多个 MCP Server 连接的生命周期
// 从 @x-mars/tools 迁移，增加 Resource / Prompt 聚合和事件系统

import { createLogger, TypedEventEmitter } from '@x-mars/shared'
import { McpClient, createMcpClient } from './mcp-client'
import { createMcpToolAdapters } from './mcp-tool-adapter'
import type {
  McpServerConfig,
  McpServerInfo,
  McpClientStatus,
  McpResource,
  McpPrompt,
  McpEvents,
} from './types'
import type { AgentTool } from '@x-mars/agent'

const logger = createLogger('@x-mars/mcp:manager')

export interface McpManagerOptions {
  /** 每个 MCP 请求超时 */
  requestTimeoutMs?: number
  /** 连接失败时是否静默跳过（默认 true） */
  skipOnError?: boolean
  /** 自动重连（默认 true） */
  autoReconnect?: boolean
  /** 最大重连次数（默认 3） */
  maxReconnectAttempts?: number
}

export class McpManager extends TypedEventEmitter<McpEvents> {
  private clients = new Map<string, McpClient>()
  private options: McpManagerOptions
  private disabledServers: Set<string>
  private toolsChangedCallback: (() => void) | null = null

  constructor(options: McpManagerOptions = {}, disabledServers: string[] = []) {
    super()
    this.options = options
    this.disabledServers = new Set(disabledServers)
  }

  /** 注册工具列表变更回调（向后兼容） */
  onToolsChanged(callback: () => void): void {
    this.toolsChangedCallback = callback
  }

  /** 从配置初始化所有 MCP Server */
  async connectAll(servers: Record<string, McpServerConfig>): Promise<void> {
    const entries = Object.entries(servers)
    if (entries.length === 0) {
      return
    }

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

  /** 连接单个 MCP Server */
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
      requestTimeoutMs: config.requestTimeoutMs ?? this.options.requestTimeoutMs,
      autoReconnect: config.autoReconnect ?? this.options.autoReconnect,
      maxReconnectAttempts: config.maxReconnectAttempts ?? this.options.maxReconnectAttempts,
    })

    // 监听工具列表变化
    client.onToolsChanged(() => {
      logger.info('MCP server "%s" tools changed', name)
      this.emit('tools.changed', { serverName: name, tools: client.getTools() })
      this.toolsChangedCallback?.()
    })

    // 监听资源列表变化
    client.onResourcesChanged(() => {
      logger.info('MCP server "%s" resources changed', name)
      this.emit('resources.changed', { serverName: name })
    })

    client.onPromptsChanged(() => {
      logger.info('MCP server "%s" prompts changed', name)
      this.emit('prompts.changed', { serverName: name })
    })

    // 监听断连
    client.onDisconnected((reason) => {
      logger.info('MCP server "%s" disconnected: %s', name, reason ?? 'unknown')
      this.emit('server.disconnected', { name, reason })
    })

    try {
      await client.connect()
      this.clients.set(name, client)
      this.emit('server.connected', { name, tools: client.getTools().length })
    } catch (err) {
      const message = (err as Error).message
      this.emit('server.error', { name, error: message })

      if (this.options.skipOnError !== false) {
        logger.warn('MCP server "%s" connection failed, skipping: %s', name, message)
      } else {
        throw err
      }
    }
  }

  /** 断开单个 MCP Server */
  async disconnect(name: string): Promise<void> {
    const client = this.clients.get(name)
    if (client) {
      await client.disconnect()
      this.clients.delete(name)
      this.emit('server.disconnected', { name, reason: 'manual disconnect' })
    }
  }

  /** 断开所有连接 */
  async disconnectAll(): Promise<void> {
    const names = [...this.clients.keys()]
    await Promise.allSettled(names.map((name) => this.disconnect(name)))
  }

  /** 获取所有可用 MCP 工具（已转换为 AgentTool） */
  getAllTools(): AgentTool[] {
    const tools: AgentTool[] = []
    for (const [name, client] of this.clients) {
      if (client.getStatus() === 'ready') {
        tools.push(...createMcpToolAdapters(client, name))
      }
    }
    return tools
  }

  /** 获取所有可用资源（跨 server 聚合） */
  getAllResources(): Array<McpResource & { serverName: string }> {
    const resources: Array<McpResource & { serverName: string }> = []
    for (const [name, client] of this.clients) {
      if (client.getStatus() === 'ready') {
        for (const resource of client.getResources()) {
          resources.push({ ...resource, serverName: name })
        }
      }
    }
    return resources
  }

  /** 获取所有可用 prompts（跨 server 聚合） */
  getAllPrompts(): Array<McpPrompt & { serverName: string }> {
    const prompts: Array<McpPrompt & { serverName: string }> = []
    for (const [name, client] of this.clients) {
      if (client.getStatus() === 'ready') {
        for (const prompt of client.getPrompts()) {
          prompts.push({ ...prompt, serverName: name })
        }
      }
    }
    return prompts
  }

  /** 获取所有 server instructions（跨 server 聚合） */
  getServerInstructions(): Array<{ serverName: string; instructions: string }> {
    const instructions: Array<{ serverName: string; instructions: string }> = []
    for (const [name, client] of this.clients) {
      if (client.getStatus() === 'ready') {
        const text = client.getInstructions()
        if (text?.trim()) {
          instructions.push({ serverName: name, instructions: text })
        }
      }
    }
    return instructions
  }

  /** 通过 server name 获取 client（用于高级操作如读取 resource） */
  getClient(name: string): McpClient | undefined {
    return this.clients.get(name)
  }

  /** 获取所有 MCP Server 的状态信息 */
  getServerInfos(): McpServerInfo[] {
    const infos: McpServerInfo[] = []

    for (const [name, client] of this.clients) {
      infos.push({
        name,
        config: {} as McpServerConfig,
        status: client.getStatus(),
        tools: client.getTools(),
        resources: client.getResources(),
        prompts: client.getPrompts(),
        instructions: client.getInstructions(),
        capabilities: client.getCapabilities() ?? undefined,
        error: client.getStatus() === 'error' ? 'Connection failed' : undefined,
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

  /** 获取已连接 server 数量 */
  get connectedCount(): number {
    let count = 0
    for (const client of this.clients.values()) {
      if (client.getStatus() === 'ready') {
        count++
      }
    }
    return count
  }

  /** 获取 MCP 工具总数 */
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

// McpRuntime — 应用级 MCP 生命周期管理
// 职责：读取配置、创建/持有 McpManager、将 MCP 工具注册到 ToolRegistry、处理工具列表变更
// 属于 coding 层（应用编排），tools 层只负责协议运行时

import { createLogger } from '@vitamin/shared'
import {
  createMcpManager,
  type McpManager,
  type McpManagerOptions,
  type McpServerConfig,
  type McpServerInfo,
} from '@vitamin/tools'
import type { AgentTool } from '@vitamin/agent'
import type { ToolRegistry } from '@vitamin/tools'

const logger = createLogger('@vitamin/coding:mcp-runtime')

export interface McpRuntimeOptions {
  servers: Record<string, McpServerConfig>
  disabledServers?: string[]
  managerOptions?: McpManagerOptions
  // 可选：传入 ToolRegistry 自动注册 MCP 工具
  toolRegistry?: ToolRegistry
}

export class McpRuntime {
  private manager: McpManager
  private toolRegistry: ToolRegistry | null
  private started = false

  constructor(options: McpRuntimeOptions) {
    this.manager = createMcpManager(
      { skipOnError: true, ...options.managerOptions },
      options.disabledServers,
    )
    this.toolRegistry = options.toolRegistry ?? null

    // 监听工具列表变更 → 重新注册
    this.manager.onToolsChanged(() => {
      logger.info('MCP tools changed, re-registering')
      this.syncToolsToRegistry()
    })
  }

  // 连接所有 MCP 服务并注册工具
  async start(servers: Record<string, McpServerConfig>): Promise<void> {
    if (this.started) return

    await this.manager.connectAll(servers)
    this.syncToolsToRegistry()
    this.started = true

    logger.info(
      'McpRuntime started: %d servers connected, %d tools available',
      this.manager.connectedCount,
      this.manager.toolCount,
    )
  }

  // 断开所有连接并清理注册的工具
  async stop(): Promise<void> {
    if (!this.started) return

    this.clearToolsFromRegistry()
    await this.manager.disconnectAll()
    this.started = false
  }

  // 获取底层 McpManager
  getManager(): McpManager {
    return this.manager
  }

  // 获取所有 MCP AgentTool
  getTools(): AgentTool[] {
    return this.manager.getAllTools()
  }

  // 获取所有 MCP Server 状态
  getServerInfos(): McpServerInfo[] {
    return this.manager.getServerInfos()
  }

  get connectedCount(): number {
    return this.manager.connectedCount
  }

  get toolCount(): number {
    return this.manager.toolCount
  }

  // 将 MCP 工具同步到 ToolRegistry（category: 'mcp', preset: 'standard'）
  private syncToolsToRegistry(): void {
    if (!this.toolRegistry) return

    this.clearToolsFromRegistry()

    const mcpTools = this.manager.getAllTools()
    if (mcpTools.length > 0) {
      this.toolRegistry.register(mcpTools, {
        preset: 'standard',
        category: 'mcp',
        builtin: false,
      })
      logger.debug('Registered %d MCP tools into ToolRegistry', mcpTools.length)
    }
  }

  // 从 ToolRegistry 移除所有 MCP 工具
  private clearToolsFromRegistry(): void {
    if (!this.toolRegistry) return

    const mcpToolNames = this.toolRegistry.getByCategory('mcp').map((t) => t.name)
    if (mcpToolNames.length > 0) {
      this.toolRegistry.unregister(mcpToolNames)
    }
  }
}

export function createMcpRuntime(options: McpRuntimeOptions): McpRuntime {
  return new McpRuntime(options)
}

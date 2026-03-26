
import { Devtools } from '@vitamin/devtools'
import { createLogger } from '@vitamin/shared'
import { attachLogListener } from '@vitamin/shared'
import { createHookRegistry } from '@vitamin/hooks'
import { McpRuntime, createMcpRuntime } from './mcp-runtime'
import { CodingSessionManager, createCodingSessionManager } from './coding-session-manager'
import { SettingsManager } from './settings-manager'
import { DefaultResourceLoader } from './resource-loader'
import { ExtensionManager } from './extension-api'
import { AgentSession } from './agent-session'

import type { SessionStore, SessionPersistence } from '@vitamin/session'
import type { AgentMessage, AgentTool } from '@vitamin/agent'
import type { Model, ProviderRegistry } from '@vitamin/ai'
import type { HookRegistry } from '@vitamin/hooks'
import type { ConfigStore, VitaminConfig } from '@vitamin/config'
import type { ResourceLoader, ResourceLoaderOptions } from './resource-loader'
import type { ExtensionModule } from './extension-api'
import type {
  AgentSessionOptions,
  AgentSessionInfo,
} from './types'

export interface VitaminAppOptions {
  port: number
  inspect: boolean
  logger: {
    name: string
    level: 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'fatal'
    destination: string
  }
  // 自定义 SessionStore 实现（默认 InMemorySessionStore）
  sessionStore?: SessionStore<AgentMessage>
  // 默认模型
  model?: Model
  // 默认工具集 
  tools?: AgentTool[]
  // Provider 注册表
  providerRegistry?: ProviderRegistry
  // 默认系统提示词
  systemPrompt?: string
  // 全局 Hook 注册表
  hooks?: HookRegistry
  // 工作目录
  workspaceDir?: string
  // 全局配置文件路径
  globalConfigPath?: string
  // 项目级配置文件路径
  projectConfigPath?: string
  // 配置覆盖（最高优先级）
  configOverrides?: Partial<VitaminConfig>
  // 配置持久化后端
  configStore?: ConfigStore
  // 是否监听配置文件变更
  watchConfig?: boolean
  // 会话存储目录（启用文件持久化）
  sessionDir?: string
  // 会话存储 API 端点（启用远程持久化）
  sessionUrl?: string
  // 自定义会话持久化后端
  sessionPersistence?: SessionPersistence<AgentMessage>
  // 最大并发会话数
  maxSessions?: number
  // 资源加载器（AGENTS.md、Skills、Prompt 模板）
  resourceLoader?: ResourceLoader
  // 资源加载选项（当 resourceLoader 未提供时使用）
  resourceOptions?: ResourceLoaderOptions
  // 扩展模块列表（start() 时自动激活）
  extensions?: ExtensionModule[]
}


// VitaminApp — 多会话 Agent 应用容器。
// 核心职责:
// 1. 管理多个并发 AgentSession（创建、检索、列举、销毁）
// 2. 共享基础设施（config、logger、devtools、providerRegistry）
// 3. 提供统一 SystemContext 接口
// 每个 AgentSession 拥有:
// - 独立的 Agent 实例（状态机 + 工具调用循环）
// - 独立的 Session 存储（消息历史）
// - 独立的事件流
export class VitaminApp {
  private devtools: Devtools | null = null
  private codingSessionManager!: CodingSessionManager
  private mcpRuntime: McpRuntime | null = null
  private options: VitaminAppOptions
  
  public settings: SettingsManager | null = null
  public resourceLoader: ResourceLoader | null = null
  public extensionManager: ExtensionManager

  public readonly logger: ReturnType<typeof createLogger>
  public readonly hooks: HookRegistry
  public readonly workspaceDir: string
  private globalLogSubscription: ReturnType<typeof attachLogListener> | null = null

  constructor(options: VitaminAppOptions) {
    this.options = options
    this.workspaceDir = options.workspaceDir ?? process.cwd()

    if (options.inspect) {
      this.devtools = new Devtools(options.port)

      this.globalLogSubscription = attachLogListener((data) => {
        const log = data as { name: string; level: string; msg: string }
        if (log.name === 'vitamin-app') {
          this.devtools?.logger.publish(log)
        }
      })
    }

    this.logger = createLogger(options.logger.name, {
      level: options.logger.level,
      destination: options.logger.destination,
    })

    this.hooks = options.hooks ?? createHookRegistry({ preset: 'default' })

    this.extensionManager = new ExtensionManager(this.hooks)

    // SessionManager 延迟到 start() 完整初始化，但先创建内存版本供 start 前使用
    this.codingSessionManager = this.buildSessionManager()
  }

  private buildSessionManager(): CodingSessionManager {
    const opts = this.options

    return createCodingSessionManager({
      sessionDir: opts.sessionDir,
      sessionUrl: opts.sessionUrl,
      model: opts.model,
        systemPrompt: opts.systemPrompt,
        tools: opts.tools,
        providerRegistry: opts.providerRegistry,
        hooks: this.hooks,
        workspaceDir: this.workspaceDir,
        maxSessions: opts.maxSessions,
        devtools: this.devtools ?? undefined,
    })
  }

  // 获取当前合并后的配置（settings 加载后可用）
  get config(): Readonly<VitaminConfig> | null {
    return this.settings?.config ?? null
  }

  // 会话管理器 
  get sessionManager(): CodingSessionManager {
    return this.codingSessionManager
  }

  // 创建新的 AgentSession。
  // 每次调用创建一个独立的 Agent + Session 对，
  // 类似 pi-mono 的 createAgentSession() 工厂。
  async createSession(options?: AgentSessionOptions): Promise<AgentSession> {
    const agentSession = await this.codingSessionManager.createSession(options)
    this.logger.info('Session created: %s', agentSession.id)
    return agentSession
  }

  // 通过 ID 检索活跃的 AgentSession。
  getSession(id: string): AgentSession | undefined {
    return this.codingSessionManager.getSession(id)
  }

  // 列举所有活跃 AgentSession 的信息。
  listSessions(): AgentSessionInfo[] {
    return this.codingSessionManager.listSessions()
  }

  // 移除并销毁一个 AgentSession。
  async removeSession(id: string): Promise<boolean> {
    const removed = await this.codingSessionManager.removeSession(id)
    if (removed) {
      this.logger.info('Session removed: %s', id)
    }
    return removed
  }

  // Fork 一个会话
  async forkSession(sourceId: string, newId?: string): Promise<AgentSession | undefined> {
    return this.codingSessionManager.forkSession(sourceId, newId)
  }

  // 获取 MCP Runtime（可用于查询可用 MCP 工具和服务器状态）
  getMcpRuntime(): McpRuntime | null {
    return this.mcpRuntime
  }

  // 获取来自 MCP 的所有 AgentTool（可合并到 session tools）
  getMcpTools(): AgentTool[] {
    return this.mcpRuntime?.getTools() ?? []
  }

  // 通知后台任务启动（供 orchestrator 调用）
  async emitBackgroundStart(taskId: string, agentName: string): Promise<void> {
    await this.hooks.emit('background.start', { taskId, agentName })
  }

  // 通知后台任务结束（供 orchestrator 调用）
  async emitBackgroundEnd(taskId: string, agentName: string, success: boolean): Promise<void> {
    await this.hooks.emit('background.end', { taskId, agentName, success })
  }

  async start() {
    // 初始化 SettingsManager（全局 + 项目配置合并、可选热更新）
    this.settings = await SettingsManager.create({
      workspaceDir: this.workspaceDir,
      globalConfigPath: this.options.globalConfigPath,
      projectConfigPath: this.options.projectConfigPath,
      overrides: this.options.configOverrides,
      store: this.options.configStore,
      watch: this.options.watchConfig,
    })

    // 初始化 ResourceLoader（AGENTS.md、Skills、Prompt 模板）
    this.resourceLoader = this.options.resourceLoader
      ?? new DefaultResourceLoader({
        workspaceDir: this.workspaceDir,
        watch: this.options.watchConfig,
        ...this.options.resourceOptions,
      })

    await this.resourceLoader.load()

    // 激活扩展
    if (this.options.extensions) {
      for (const ext of this.options.extensions) {
        try {
          await this.extensionManager.activate(ext)
        } catch (err) {
          const name = ext.descriptor?.name ?? 'unknown'
          await this.hooks.emit('extension.error', {
            extensionName: name,
            error: err instanceof Error ? err : new Error(String(err)),
          })

          this.logger.error('Failed to activate extension %s: %s', name, err)
        }
      }
    }

    if (this.devtools) {
      await this.devtools.start()
    }

    // 初始化 MCP Runtime（读取配置中的 mcp.servers + disabled_mcps）
    const mcpConfig = this.settings?.config?.mcp
    const disabledMcps = this.settings?.config?.disabled_mcps ?? []

    if (mcpConfig?.servers && Object.keys(mcpConfig.servers).length > 0) {
      this.mcpRuntime = createMcpRuntime({
        servers: mcpConfig.servers,
        disabledServers: disabledMcps,
      })
      await this.mcpRuntime.start(mcpConfig.servers)
      this.logger.info('MCP: %d servers connected, %d tools available', this.mcpRuntime.connectedCount, this.mcpRuntime.toolCount)
    }

    this.logger.info('VitaminApp started')
  }

  async stop() {
    // 停止 MCP Runtime
    if (this.mcpRuntime) {
      await this.mcpRuntime.stop()
      this.mcpRuntime = null
    }

    // 销毁所有 AgentSession
    this.codingSessionManager.dispose()

    // 销毁 ResourceLoader
    if (this.resourceLoader) {
      this.resourceLoader.dispose()
      this.resourceLoader = null
    }

    // 销毁 ExtensionManager
    this.extensionManager.dispose()

    // 销毁 SettingsManager（停止配置文件监听）
    if (this.settings) {
      this.settings.dispose()
      this.settings = null
    }

    if (this.devtools) {
      await this.devtools.stop()

      if (this.globalLogSubscription) {
        this.globalLogSubscription()
        this.globalLogSubscription = null
      }
    }
  }
}

export function createVitamin(options: VitaminAppOptions): VitaminApp {
  return new VitaminApp(options)
}
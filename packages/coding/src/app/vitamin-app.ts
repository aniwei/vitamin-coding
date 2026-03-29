// VitaminApp — 多会话 Agent 应用容器。
// 核心职责:
// 1. 管理多个并发 AgentSession（创建、检索、列举、销毁）
// 2. 共享基础设施（config、logger、devtools、providerRegistry）
// 3. 提供统一 SystemContext 接口
// 每个 AgentSession 拥有:
// - 独立的 Agent 实例（状态机 + 工具调用循环）
// - 独立的 Session 存储（消息历史）
// - 独立的事件流
import { Devtools } from '@vitamin/devtools'
import { createLogger, attachLogListener } from '@vitamin/shared'
import { createHookRegistry } from '@vitamin/hooks'
import { createDefaultProviderRegistry, ModelRegistry, createDefaultModelRegistry } from '@vitamin/ai'
import { CodingSessionManager, createCodingSessionManager } from '../session/coding-session-manager'
import { AgentSession } from '../session/agent-session'
import { LeadSession, createLeadSession } from '../lead/lead-session'
import { PromptManager } from '../lead/prompt-manager'
import { createSessionFactoryAdapter } from './session-factory-adapter'
import {
  buildLeadSystemPrompt,
  bootstrapToolsAndOrchestrator,
  createAppToolRegistry,
} from './vitamin-bootstrap'

import type { ToolRegistry } from '@vitamin/tools'
import type { AuthStore, ProviderRegistry } from '@vitamin/ai'
import type { HookRegistry } from '@vitamin/hooks'
import type { VitaminConfig } from '@vitamin/config'
import type { Orchestrator } from '@vitamin/orchestrator'
import { Settings, type SettingsManager, type SettingsOptions } from '../resources/settings-manager'
import { DefaultResourceManager, type ResourceManager, type ResourceManagerOptions } from '../resources/resource-manager'
import type { LeadResult, LeadRunOptions } from '../lead/lead-session'
import type { AgentSessionOptions, AgentSessionInfo } from '../session/types'
import type { VitaminAppOptions } from './types'

export { type VitaminAppOptions } from './types'

export class VitaminApp {
  private readonly options: VitaminAppOptions
  private devtools: Devtools | null = null
  private leadSession: LeadSession | null = null
  private leadSystemPrompt: string | null = null
  private codingSessionManager!: CodingSessionManager
  
  public settings: SettingsManager | null = null
  public toolRegistry: ToolRegistry | null = null
  public orchestrator: Orchestrator | null = null
  public resourceManager: ResourceManager | null = null
  public promptManager: PromptManager | null = null

  public readonly workspaceDir: string
  public readonly auth: AuthStore
  public readonly hooks: HookRegistry
  public readonly modelRegistry: ModelRegistry
  public readonly providerRegistry: ProviderRegistry
  public readonly logger: ReturnType<typeof createLogger>

  private globalLogSubscription: ReturnType<typeof attachLogListener> | null = null

  constructor(options: VitaminAppOptions) {
    this.options = options

    const { auth, logger, hooks, model, modelId, modelRegistry, providerRegistry, workspaceDir } = options
    this.workspaceDir = workspaceDir ?? process.cwd()
    this.logger = createLogger(logger.name, {
      level: logger.level,
      destination: logger.destination,
    })

    this.hooks = hooks ?? createHookRegistry({ preset: 'default' })
    this.providerRegistry = providerRegistry ?? createDefaultProviderRegistry({ auth })
    this.auth = this.providerRegistry.getAuthStore()!

    this.modelRegistry = modelRegistry ?? this.providerRegistry.getModelRegistry() ?? createDefaultModelRegistry()
    this.providerRegistry.setModelRegistry(this.modelRegistry)

    const resolvedModel = model ?? (modelId ? this.providerRegistry.resolveModel(modelId) : undefined)

    if (resolvedModel) {
      this.modelRegistry.setDefault(resolvedModel)
    } 

    const { sessionUrl, sessionDir, tools, systemPrompt, maxSessions, maxToolTurns } = options

    this.codingSessionManager = createCodingSessionManager({
      sessionDir,
      sessionUrl,
      model: resolvedModel,
      tools,
      systemPrompt,
      providerRegistry: this.providerRegistry,
      hooks: this.hooks,
      workspaceDir: this.workspaceDir,
      maxSessions,
      maxToolTurns,
      devtools: this.devtools ?? undefined,
      logger: this.logger
    })

    this.settings = new Settings(this.createSettingsOptions())
    this.resourceManager = options.resourceManager
      ?? new DefaultResourceManager(this.createResourceOptions())
    this.toolRegistry = createAppToolRegistry(this.workspaceDir)
    this.promptManager = new PromptManager()

    const { inspect } = options
    if (inspect) {
      this.devtools = new Devtools(options.port)
      this.globalLogSubscription = attachLogListener((data) => {
        const log = data as { name: string; level: string; msg: string }
        if (log.name === 'vitamin-app') {
          this.devtools?.logger.publish(log)
        }
      })
    }
  }

  async start() {
    await this.settings?.load()
    await this.resourceManager?.load()

    this.promptManager!.setResources(this.resourceManager?.resources ?? null)

    const sessionFactory = createSessionFactoryAdapter({
      codingSessionManager: this.codingSessionManager,
      getToolRegistry: () => this.toolRegistry,
      promptManager: this.promptManager!,
      defaultTools: this.options.tools,
      modelRegistry: this.modelRegistry,
    })

    const initialLeadSystemPrompt = buildLeadSystemPrompt({
      options: this.options,
      resources: this.resourceManager,
      promptManager: this.promptManager!,
    })

    const { agentSpecs, orchestrator } = bootstrapToolsAndOrchestrator({
      options: this.options,
      workspaceDir: this.workspaceDir,
      settings: this.settings,
      toolRegistry: this.toolRegistry!,
      sessionFactory,
      hooks: this.hooks,
      leadSystemPrompt: initialLeadSystemPrompt,
    })
    this.orchestrator = orchestrator

    this.leadSystemPrompt = buildLeadSystemPrompt({
      options: this.options,
      resources: this.resourceManager,
      promptManager: this.promptManager!,
      agentSpecs,
      toolRegistry: this.toolRegistry,
    })
    this.codingSessionManager.updateDefaults({
      systemPrompt: this.leadSystemPrompt,
      tools: this.toolRegistry?.getAvailable('full') as never,
    })

    if (this.devtools) {
      await this.devtools.start()
    }

    this.logger.info('VitaminApp started')
  }

  async stop() {
    if (this.leadSession) {
      this.leadSession.dispose()
      this.leadSession = null
    }

    this.leadSystemPrompt = null

    this.orchestrator = null
    if (this.toolRegistry) {
      this.toolRegistry.clear()
      this.toolRegistry = null
    }

    this.codingSessionManager.dispose()

    if (this.resourceManager) {
      this.resourceManager.dispose()
      this.resourceManager = null
    }

    if (this.promptManager) {
      this.promptManager = null
    }
    
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

    this.logger.info('Vitamin app stopped')
  }

  getDevtools(): Devtools | null {
    return this.devtools
  }

  get config(): Readonly<VitaminConfig> | null {
    return this.settings?.snapshot ?? null
  }

  get resources() {
    return this.resourceManager?.resources ?? null
  }

  get sessionManager(): CodingSessionManager {
    return this.codingSessionManager
  }

  async createSession(options?: AgentSessionOptions): Promise<AgentSession> {
    const mergedOptions = { ...options }

    // Attach version-based prompt refresh if not explicitly provided
    if (!mergedOptions.promptRefreshFn && this.toolRegistry) {
      let lastVersion = this.toolRegistry.version
      mergedOptions.promptRefreshFn = () => {
        const currentVersion = this.toolRegistry?.version ?? lastVersion
        if (currentVersion === lastVersion) return undefined
        lastVersion = currentVersion
        this.leadSystemPrompt = buildLeadSystemPrompt({
          options: this.options,
          resources: this.resourceManager,
          promptManager: this.promptManager!,
          toolRegistry: this.toolRegistry,
        })
        return this.leadSystemPrompt
      }
    }

    const agentSession = await this.codingSessionManager.createSession(mergedOptions)
    this.logger.info('Session created: %s', agentSession.id)
    return agentSession
  }

  getSession(id: string): AgentSession | undefined {
    return this.codingSessionManager.getSession(id)
  }

  listSessions(): AgentSessionInfo[] {
    return this.codingSessionManager.listSessions()
  }

  async removeSession(id: string): Promise<boolean> {
    const removed = await this.codingSessionManager.removeSession(id)
    if (removed) {
      this.logger.info('Session removed: %s', id)
    }
    return removed
  }

  async forkSession(sourceId: string, newId?: string): Promise<AgentSession | undefined> {
    return this.codingSessionManager.forkSession(sourceId, newId)
  }

  async lead(userPrompt: string, options?: LeadRunOptions): Promise<LeadResult> {
    if (!this.leadSession) {
      const session = await this.createSession()
      this.codingSessionManager.setActive(session.id)
      this.leadSession = createLeadSession(session, this.orchestrator)
    }
    return this.leadSession.run(userPrompt, options)
  }

  getLeadSession(): LeadSession | null {
    return this.leadSession
  }

  getLeadSystemPrompt(): string | null {
    return this.leadSystemPrompt
  }

  // ═══ Background Events ═══

  async emitBackgroundStart(taskId: string, agentName: string): Promise<void> {
    await this.hooks.emit('background.start', { taskId, agentName })
  }

  async emitBackgroundEnd(taskId: string, agentName: string, success: boolean): Promise<void> {
    await this.hooks.emit('background.end', { taskId, agentName, success })
  }

  private createSettingsOptions(): SettingsOptions {
    return {
      workspaceDir: this.workspaceDir,
      globalConfigPath: this.options.globalConfigPath,
      projectConfigPath: this.options.projectConfigPath,
      overrides: this.options.configOverrides,
      store: this.options.configStore,
      watch: this.options.watchConfig,
    }
  }

  private createResourceOptions(): ResourceManagerOptions {
    return {
      workspaceDir: this.workspaceDir,
      watch: this.options.watchConfig,
      ...this.options.resourceOptions,
    }
  }
}

export function createVitamin(options: VitaminAppOptions): VitaminApp {
  return new VitaminApp(options)
}

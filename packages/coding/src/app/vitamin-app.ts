// VitaminApp — 多会话 Agent 应用容器。
// 核心职责:
// 1. 管理多个并发 AgentSession（创建、检索、列举、销毁）
// 2. 共享基础设施（config、logger、devtools、providerRegistry）
// 3. 提供统一 SystemContext 接口
// 每个 AgentSession 拥有:
// - 独立的 Agent 实例（状态机 + 工具调用循环）
// - 独立的 Session 存储（消息历史）
// - 独立的事件流
import { join } from 'node:path'
import { Devtools } from '@vitamin/devtools'
import {
  createDefaultModelRegistry,
  createDefaultProviderRegistry,
  ModelRegistry,
} from '@vitamin/ai'
import { createHookRegistry } from '@vitamin/hooks'
import {
  createCapabilityStrategy,
  createCircuitBreaker,
  createClarifyChannel,
  createCompositeRouter,
  createOrchestrator,
  createModelTierStrategy,
  createRetryStrategy,
  createReviewGate,
  registerAgents,
  createLocalPlanStore,
  createAgentProfileRegistry,
  BUILTIN_AGENT_PROFILES,
} from '@vitamin/orchestrator'
import {
  createBinaryToolExecutorRegistry,
  registerBuiltinTools,
  ToolRegistry,
} from '@vitamin/tools'
import { attachLogListener, createLogger } from '@vitamin/shared'
import {
  LeadSession,
  createLeadSession,
} from '../lead/lead-session'
import {
  LEAD_ROLE_INSTRUCTIONS,
  PromptManager,
} from '../lead/prompt-manager'
import {
  DefaultResourceManager,
  type ResourceManager,
} from '../resources/resource-manager'
import {
  Settings,
  type SettingsManager,
} from '../resources/settings-manager'
import { AgentSession } from '../session/agent-session'
import {
  CodingSessionManager,
  createDiskCodingSessionManager,
  createRemoteCodingSessionManager,
  createInMemoryCodingSessionManager,
} from '../session/coding-session-manager'
import { createSessionFactoryAdapter } from './session-factory-adapter'

import type { AgentTool } from '@vitamin/agent'
import type { AuthStore, ProviderRegistry } from '@vitamin/ai'
import type { VitaminConfig } from '@vitamin/config'
import type { HookRegistry } from '@vitamin/hooks'
import type {
  AgentSpec,
  ModelSelector,
  Orchestrator,
  OrchestratorTask,
  SessionFactory,
} from '@vitamin/orchestrator'
import type { RegisteredTool } from '@vitamin/tools'
import type {
  LeadResult,
  LeadRunOptions,
} from '../lead/lead-session'
import type {
  PromptAgentSummary,
  PromptToolSummary,
} from '../lead/prompt-manager'
import type {
  AgentSessionInfo,
  AgentSessionOptions,
} from '../session/types'

import type { VitaminAppOptions, VitaminRuntime } from './types'
export { type VitaminAppOptions, type VitaminRuntime } from './types'

interface ResolvedWorkflowDefaults {
  approver?: ReturnType<typeof createReviewGate>
  retryStrategy?: ReturnType<typeof createRetryStrategy>
  circuitBreaker?: ReturnType<typeof createCircuitBreaker>
  router?: ReturnType<typeof createCompositeRouter>
}


export class VitaminApp implements VitaminRuntime {
  public readonly codingSessionManager: CodingSessionManager
  
  public readonly settings: SettingsManager
  public readonly tools: ToolRegistry
  public readonly resource: ResourceManager
  public readonly prompt: PromptManager
  public readonly hookRegistry: HookRegistry
  public readonly providerRegistry: ProviderRegistry
  public readonly workspaceDir: string
  public readonly logger: ReturnType<typeof createLogger>
  
  private devtools: Devtools | null = null

  public get modelRegistry(): ModelRegistry {
    return this.providerRegistry.getModelRegistry()
  }
  public get authStore(): AuthStore {
    return this.providerRegistry.getAuthStore()
  }

  private globalLogSubscription: ReturnType<typeof attachLogListener> | null = null

  constructor(options: VitaminAppOptions) {
    const {
      inspect,
      logger,
      maxSessions,
      maxToolTurns,
      model,
      port,
      resourceManager,
      retryStrategy,
      review,
      systemPrompt,
      tools,
      workspaceDir,
    } = options

    this.workspaceDir = workspaceDir ?? process.cwd()
    this.logger = createLogger(logger.name, {
      level: logger.level,
      destination: logger.destination,
    })

    const { 
      authStore,
      hookRegistry, 
      modelRegistry, 
      providerRegistry 
    } = options
    
    this.hookRegistry = hookRegistry ?? createHookRegistry({ preset: 'default' })
    this.providerRegistry = providerRegistry ?? createDefaultProviderRegistry({ authStore, modelRegistry })
    
    if (inspect) {
      this.devtools = new Devtools(port)
      this.globalLogSubscription = attachLogListener((data) => {
        const log = data as { name: string; level: string; msg: string }
        if (log.name === logger.name) {
          this.devtools?.logger.publish(log)
        }
      })
    }

    const { persistenceMode } = options
    if (persistenceMode === 'disk') {
      const { sessionDir } = options
      this.codingSessionManager = createDiskCodingSessionManager(sessionDir )
    } else if (persistenceMode === 'remote') {
      const { sessionUrl } = options
      this.codingSessionManager = createRemoteCodingSessionManager({ sessionUrl })
    } else {
      this.codingSessionManager = createInMemoryCodingSessionManager()
    }



    this.codingSessionManager = createCodingSessionManager({
      sessionDir,
      sessionUrl,
      model: resolvedModel,
      tools,
      systemPrompt,
      providerRegistry: this.providerRegistry,
      hookRegistry: this.hookRegistry,
      workspaceDir: this.workspaceDir,
      maxSessions,
      maxToolTurns,
      devtools: this.devtools ?? undefined,
      logger: this.logger,
    })

    this.settings = new Settings({
      workspaceDir: this.workspaceDir,
      globalConfigPath,
      projectConfigPath,
      overrides: configOverrides,
      store: configStore,
      watch: watchConfig,
    })

    this.prompt = new PromptManager()
    this.tools = new ToolRegistry()
    this.tools.setBinaryToolExecutors(createBinaryToolExecutorRegistry(this.workspaceDir))
    this.resource = resourceManager ?? new DefaultResourceManager({
      workspaceDir: this.workspaceDir,
      watch: watchConfig,
      ...resourceOptions,
    })
  }

  async start() {
    if (this._orchestrator) return
    if (this.hasStopped) {
      throw new Error('VitaminApp cannot be restarted after stop(); create a new instance instead.')
    }

    await this.settings.load()
    await this.resource.load()

    this.prompt.setResources(this.resource.resources ?? null)

    const initBag = this._initBag!
    this._initBag = null

    const sessionFactory = this.createSessionFactory()
    const initialLeadSystemPrompt = this.buildLeadSystemPrompt()
    const { orchestrator } = this.createOrchestratorRuntime(
      sessionFactory,
      initialLeadSystemPrompt,
      initBag,
    )
    this._orchestrator = orchestrator


    this.leadSystemPrompt = this.buildLeadSystemPrompt(
      this._orchestrator.agentRegistry.list(),
    )
    this.codingSessionManager.updateDefaults({
      systemPrompt: this.leadSystemPrompt,
      tools: this.tools.getAvailable('full') as never,
    })

    if (this.devtools) {
      await this.devtools.start()
    }

    this.logger.info('VitaminApp started')
  }

  async stop() {
    if (this.hasStopped) return

    if (this._leadSession) {
      this._leadSession.dispose()
      this._leadSession = null
    }


    this.leadSystemPrompt = null
    this._orchestrator = null
    this.tools.clear()
    this.codingSessionManager.dispose()
    this.resource.dispose()
    this.prompt.setResources(null)
    this.settings.dispose()

    if (this.devtools) {
      await this.devtools.stop()
    }
    if (this.globalLogSubscription) {
      this.globalLogSubscription()
      this.globalLogSubscription = null
    }

    this.hasStopped = true
    this.logger.info('Vitamin app stopped')
  }

  getDevtools(): Devtools | null {
    return this.devtools
  }

  get runtime(): VitaminRuntime {
    return this
  }

  get toolRegistry(): ToolRegistry {
    return this.tools
  }

  get toolsRegistry(): ToolRegistry {
    return this.tools
  }

  get hooksRegistry(): HookRegistry {
    return this.hooks
  }

  get settingsManager(): SettingsManager {
    return this.settings
  }

  get resourceManager(): ResourceManager {
    return this.resource
  }

  get promptManager(): PromptManager {
    return this.prompt
  }

  get config(): Readonly<VitaminConfig> | null {
    return this.settings.snapshot ?? null
  }

  get resources() {
    return this.resource.resources ?? null
  }

  get sessionManager(): CodingSessionManager {
    return this.codingSessionManager
  }

  get defaultTools(): AgentTool[] | undefined {
    return this.customTools
  }

  async createSession(options?: AgentSessionOptions): Promise<AgentSession> {
    const mergedOptions = { ...options }

    if (!mergedOptions.promptRefreshFn) {
      let lastVersion = this.tools.version
      mergedOptions.promptRefreshFn = () => {
        const currentVersion = this.tools.version
        if (currentVersion === lastVersion) return undefined

        lastVersion = currentVersion
        this.leadSystemPrompt = this.buildLeadSystemPrompt(
          this._orchestrator?.agentRegistry.list() ?? [],
        )
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
    if (!this._orchestrator || !this.leadSystemPrompt) {
      throw new Error('VitaminApp.start() must be called before lead()')
    }

    if (!this._leadSession) {
      const session = await this.createSession()
      this.codingSessionManager.setActive(session.id)
      this._leadSession = createLeadSession(session, this._orchestrator)
    }

    return this._leadSession.run(userPrompt, options)
  }

  getLeadSession(): LeadSession | null {
    return this._leadSession
  }

  getLeadSystemPrompt(): string | null {
    return this.leadSystemPrompt
  }

  async emitBackgroundStart(taskId: string, agentName: string): Promise<void> {
    await this.hooks.emit('background.start', { taskId, agentName })
  }

  async emitBackgroundEnd(taskId: string, agentName: string, success: boolean): Promise<void> {
    await this.hooks.emit('background.end', { taskId, agentName, success })
  }

  private createSessionFactory(): SessionFactory {
    return createSessionFactoryAdapter(this)
  }

  private buildLeadSystemPrompt(agentSpecs: AgentSpec[] = []): string {
    return this.prompt.buildLeadPrompt({
      customSystemPrompt: this.customSystemPrompt,
      resources: this.resource.resources ?? null,
      roleInstructions: LEAD_ROLE_INSTRUCTIONS,
      agentCatalog: this.summarizeAgentCatalog(agentSpecs),
      toolCatalog: this.summarizeToolCatalog(),
    })
  }

  private summarizeToolCatalog(): PromptToolSummary[] {
    return (this.tools.getAvailable('full') as RegisteredTool[])
      .map((tool) => this.toPromptToolSummary(tool))
  }

  private summarizeAgentCatalog(agentSpecs: AgentSpec[]): PromptAgentSummary[] {
    return agentSpecs
      .filter((spec) => spec.name !== '__fallback__')
      .map((spec) => ({
        name: spec.name,
        description: spec.description,
        capabilities: spec.capabilities,
      }))
  }

  private toPromptToolSummary(tool: {
    name: string
    description: string
    metadata?: {
      category?: string
      builtin?: boolean
      snippet?: string
      guideline?: string
    }
  }): PromptToolSummary {
    return {
      name: tool.name,
      description: tool.description,
      category: tool.metadata?.category,
      source: tool.metadata?.builtin ? 'builtin' : 'custom',
      snippet: tool.metadata?.snippet,
      guideline: tool.metadata?.guideline,
    }
  }

  private createOrchestratorRuntime(
    sessionFactory: SessionFactory,
    leadSystemPrompt: string,
    initBag: DeferredInitConfig,
  ): {
    agentSpecs: AgentSpec[]
    fallbackAgent: AgentSpec | undefined
    orchestrator: Orchestrator
  } {
    const config = this.settings.snapshot ?? null
    const agentSpecs = this.compileAgentSpecs(config)
    const fallbackAgent = this.buildFallbackAgentSpec(leadSystemPrompt, initBag.fallbackModelId)
    const workflowDefaults = this.resolveWorkflowDefaults(config)
    const clarifyChannel = initBag.clarifyHandler
      ? createClarifyChannel({
        handler: async (req) => {
          const result = await initBag.clarifyHandler!(req)
          return { answer: result.answer }
        },
      })
      : undefined

    const orchestrator = createOrchestrator({
      sessionFactory,
      toolRegistry: this.tools,
      hooks: this.hooks,
      clarifyChannel,
      reviewGate: initBag.approver ?? initBag.reviewGate ?? workflowDefaults.approver,
      retryStrategy: initBag.retryStrategy ?? workflowDefaults.retryStrategy,
      circuitBreaker: initBag.circuitBreaker ?? workflowDefaults.circuitBreaker,
      router: initBag.router ?? workflowDefaults.router,
      modelSelector: this.createWorkflowSlotModelSelector(config),
      planStore: createLocalPlanStore({ baseDir: join(this.workspaceDir, '.vitamin', 'plans') }),
      agentProfileRegistry: this.createAgentProfileRegistry(),
    })

    registerAgents(orchestrator.agentRegistry, agentSpecs, fallbackAgent)
    const callbacks = orchestrator.toToolCallbacks()

    registerBuiltinTools(this.tools, this.workspaceDir, callbacks)
    if (this.customTools) {
      for (const tool of this.customTools) {
        this.tools.register(tool, { preset: 'full', category: 'custom' })
      }
    }

    return { agentSpecs, fallbackAgent, orchestrator }
  }

  private compileAgentSpecs(config: VitaminConfig | null): AgentSpec[] {
    const agentsConfig = (config as Record<string, unknown> | null)?.agents as Record<string, Record<string, unknown>> | undefined
    const disabledAgents = new Set(
      ((config as Record<string, unknown> | null)?.disabled_agents as string[]) ?? [],
    )
    if (!agentsConfig) return []

    const specs: AgentSpec[] = []
    for (const [name, cfg] of Object.entries(agentsConfig)) {
      if (cfg.disabled || disabledAgents.has(name)) continue
      if (!cfg.model) continue

      specs.push({
        name,
        description: cfg.description as string ?? `Agent "${name}" from config`,
        model: cfg.model as string,
        systemPrompt: cfg.system_prompt as string | undefined,
        tools: cfg.tools as string[] | undefined,
        capabilities: cfg.capabilities as string[] | undefined,
        maxToolTurns: cfg.max_tool_turns as number | undefined,
        modelSlots: cfg.model_slots as Record<string, string> | undefined,
      })
    }

    return specs
  }

  private buildFallbackAgentSpec(leadSystemPrompt: string, fallbackModelId: string | undefined): AgentSpec | undefined {
    const resolvedModel = this.settings.snapshot?.model ?? fallbackModelId

    return resolvedModel
      ? {
        name: '__fallback__',
        description: 'Default fallback agent — handles all tasks when no specialized agent matches.',
        model: resolvedModel,
        systemPrompt: leadSystemPrompt || undefined,
        capabilities: ['code', 'file', 'shell'],
      }
      : undefined
  }

  private resolveWorkflowDefaults(config: VitaminConfig | null): ResolvedWorkflowDefaults {
    const workflow = (config as Record<string, unknown> | null)?.workflow as Record<string, unknown> | undefined
    if (workflow?.enabled === false) return {}

    const result: ResolvedWorkflowDefaults = {}
    const review = workflow?.review as Record<string, unknown> | undefined
    if (review?.enabled !== false) {
      result.approver = createReviewGate()
    }

    const retry = workflow?.retry as Record<string, unknown> | undefined
    if (retry?.enabled !== false) {
      result.retryStrategy = createRetryStrategy({
        maxAttempts: (retry?.max_attempts as number) ?? 3,
      })
    }

    const circuitBreaker = workflow?.circuit_breaker as Record<string, unknown> | undefined
    if (circuitBreaker?.enabled !== false) {
      result.circuitBreaker = createCircuitBreaker({
        failureThreshold: (circuitBreaker?.failure_threshold as number) ?? 5,
        resetTimeoutMs: (circuitBreaker?.reset_timeout_ms as number) ?? 60_000,
      })
    }

    const routing = workflow?.routing as Record<string, unknown> | undefined
    if (routing?.enabled !== false) {
      const router = createCompositeRouter()
      router.addStrategy(createCapabilityStrategy())
      router.addStrategy(createModelTierStrategy())
      result.router = router
    }

    return result
  }

  private createWorkflowSlotModelSelector(config: VitaminConfig | null): ModelSelector {
    const globalModelSlots = (config as Record<string, unknown> | null)?.model_slots as Record<string, string> | undefined
    return {
      selectModel(task: OrchestratorTask, spec: AgentSpec): string | undefined {
        const slot = task.input.workflowSlot
        if (!slot) return undefined
        return spec.modelSlots?.[slot] ?? globalModelSlots?.[slot] ?? undefined
      },
    }
  }


  private createAgentProfileRegistry() {
    const registry = createAgentProfileRegistry()
    // 注册 builtin profiles
    for (const profile of BUILTIN_AGENT_PROFILES) {
      registry.register(profile)
    }
    // 用户配置的 profiles 可在此覆盖 builtin defaults（Phase B）
    return registry
  }
}

export function createVitamin(options: VitaminAppOptions): VitaminApp {
  return new VitaminApp(options)
}
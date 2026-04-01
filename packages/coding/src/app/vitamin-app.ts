import { join } from 'node:path'
import { Server } from 'node:http'
import { Devtools } from '@vitamin/devtools'
import {
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

import type { AgentTool } from '@vitamin/agent'
import type { AuthStore, ProviderRegistry } from '@vitamin/ai'
import type { VitaminConfig } from '@vitamin/config'
import type { HookRegistry } from '@vitamin/hooks'
import type {
  AgentSpec,
  Orchestrator,
  SessionManagerHandle,
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

import type { VitaminAppOptions, VitaminContext } from './types'
import { getLastAssistantText } from 'src/modes'
export { type VitaminAppOptions, type VitaminContext } from './types'

interface ResolvedWorkflowDefaults {
  approver?: ReturnType<typeof createReviewGate>
  retryStrategy?: ReturnType<typeof createRetryStrategy>
  circuitBreaker?: ReturnType<typeof createCircuitBreaker>
  router?: ReturnType<typeof createCompositeRouter>
}


export class VitaminApp implements VitaminContext {
  public readonly settings: SettingsManager
  public readonly toolRegistry: ToolRegistry
  public readonly resourceManager: ResourceManager
  public readonly promptManager: PromptManager
  public readonly hookRegistry: HookRegistry
  public readonly providerRegistry: ProviderRegistry
  public readonly codingSessionManager: CodingSessionManager
  public readonly orchestrator: Orchestrator
  public readonly logger: ReturnType<typeof createLogger>
  public readonly workspaceDir: string
  public readonly server: Server
  
  public readonly maxSessions: number = 5
  public readonly maxToolTurns: number = 25
  public readonly maxConcurrentTasks: number = 5
  public readonly defaultTools: AgentTool[] = []
  
  private stopped: boolean = false
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
      sessionUrl,
      sessionDir, 
      maxSessions, 
      persistenceMode,
      idleTimeoutMs, 
      threshold,
      maxToolTurns,
      maxConcurrentTasks,
      port,
      resourceManager,
      retryStrategy,
      reviewGate,
      tools,
      workspaceDir
    } = options

    this.server = new Server()
    this.defaultTools = tools ?? []
    this.maxSessions = maxSessions ?? 5
    this.maxToolTurns = maxToolTurns ?? 25
    this.maxConcurrentTasks = maxConcurrentTasks ?? 5
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
    this.providerRegistry = providerRegistry ?? createDefaultProviderRegistry({ 
      authStore, 
      modelRegistry 
    })
    
    if (inspect) {
      this.devtools = new Devtools({ 
        port: port ?? 0,
        noServer: true,
      })
      this.globalLogSubscription = attachLogListener((data) => {
        const log = data as { name: string; level: string; msg: string }
        if (log.name === logger.name) {
          this.devtools?.logger.publish(log)
        }
      })
    }

    this.settings = new Settings({
      workspaceDir: this.workspaceDir,
    })

    this.promptManager = new PromptManager()
    this.toolRegistry = new ToolRegistry()
    this.toolRegistry.setBinaryToolExecutors(createBinaryToolExecutorRegistry(this.workspaceDir))

    this.resourceManager = resourceManager ?? new DefaultResourceManager({
      workspaceDir: this.workspaceDir
    })

    if (persistenceMode === 'disk') {
      this.codingSessionManager = createDiskCodingSessionManager({
        sessionDir: sessionDir ?? '',
        maxSessions,
        idleTimeoutMs,
        threshold,
      })
    } else if (persistenceMode === 'remote') {

      this.codingSessionManager = createRemoteCodingSessionManager({ 
        sessionUrl,

      })
    } else {
      this.codingSessionManager = createInMemoryCodingSessionManager()
    }


    this.orchestrator = createOrchestrator({
      toolRegistry: this.toolRegistry,
      hookRegistry: this.hookRegistry,
      logger: this.logger,
      maxConcurrentTasks: this.maxConcurrentTasks,
      retryStrategy: retryStrategy ?? createRetryStrategy(retryStrategy),
      reviewGate: reviewGate ? createReviewGate(reviewGate) : undefined,
      sessionManager: {
        createSession: async (options: AgentSessionOptions) => {
          const agentSession = await this.createSession(options)

          return {
            id: agentSession.id,
            get status() { return agentSession.status },
            prompt: (text: string) => agentSession.prompt(text),
            abort: () => agentSession.abort(),
            getLastAssistantText: () => getLastAssistantText(agentSession.session.messages()),
          }
        },
        removeSession: async (id) => this.removeSession(id),
        getSession: (id) => {
          const session = this.getSession(id)
          if (!session) return undefined

          return {
            id: session.id,
            get status() { return session.status },
            prompt: (text: string) => session.prompt(text),
            abort: () => session.abort(),
            getLastAssistantText: () => getLastAssistantText(session.session.messages()),
          }
        }
      }
    })
  }

  async start() {
    await this.settings.load()
    await this.resourceManager.load()

    this.promptManager.setResources(this.resourceManager.resources ?? null)

    if (this.devtools) {
      await this.devtools.start()
    }

    this.logger.info('VitaminApp started')
  }

  async stop() {
   
    this.settings.dispose()
    this.toolRegistry.dispose()
    this.orchestrator.dispose()
    this.codingSessionManager.dispose()

    if (this.devtools) {
      await this.devtools.stop()
    }
    if (this.globalLogSubscription) {
      this.globalLogSubscription()
      this.globalLogSubscription = null
    }

    this.logger.info('Vitamin app stopped')
  }

  get config(): Readonly<VitaminConfig> | null {
    return this.settings.snapshot ?? null
  }

  get resources() {
    return this.resourceManager.resources ?? null
  }

  get sessionManager(): CodingSessionManager {
    return this.codingSessionManager
  }

  async createSession(options: AgentSessionOptions): Promise<AgentSession> {
    const mergedOptions = { ...options }
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

  async lead(
    userPrompt: string, 
    options?: LeadRunOptions
  ): Promise<LeadResult> {
    

    if (!this._leadSession) {
      const session = await this.createSession()
      this.codingSessionManager.setActive(session.id)
      this._leadSession = createLeadSession(session, this._orchestrator)
    }

    return this.leadSession.run(userPrompt, options)
  }

  getLeadSession(): LeadSession | null {
    return this._leadSession
  }

  getLeadSystemPrompt(): string | null {
    return this.leadSystemPrompt
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

  private createOrchestrator(
    sessionFactory: SessionFactory,
    leadSystemPrompt: string
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
      toolRegistry: this.toolRegistry,
      hookRegistry: this.hookRegistry,
      clarifyChannel,
      retryStrategy: this.retryStrategy ?? workflowDefaults.retryStrategy,
      circuitBreaker: initBag.circuitBreaker ?? workflowDefaults.circuitBreaker,
      router: initBag.router ?? workflowDefaults.router,
      planStore: createLocalPlanStore({ baseDir: join(this.workspaceDir, '.vitamin', 'plans') }),
      agentProfileRegistry: this.createAgentProfileRegistry(),
    })

    // const orchestrator = createOrchestrator({
    //   sessionFactory,
    //   toolRegistry: this.tools,
    //   hooks: this.hooks,
    //   clarifyChannel,
    //   reviewGate: initBag.approver ?? initBag.reviewGate ?? workflowDefaults.approver,
    //   retryStrategy: initBag.retryStrategy ?? workflowDefaults.retryStrategy,
    //   circuitBreaker: initBag.circuitBreaker ?? workflowDefaults.circuitBreaker,
    //   router: initBag.router ?? workflowDefaults.router,
    //   planStore: createLocalPlanStore({ baseDir: join(this.workspaceDir, '.vitamin', 'plans') }),
    //   agentProfileRegistry: this.createAgentProfileRegistry(),
    // })

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
    const disabledAgents = new Set(((config as Record<string, unknown> | null)?.disabled_agents as string[]) ?? [])
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


  private createAgentProfileRegistry() {
    const registry = createAgentProfileRegistry()

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
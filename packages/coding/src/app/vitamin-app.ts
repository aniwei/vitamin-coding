import { Devtools } from '@vitamin/devtools'
import {
  createDefaultProviderRegistry,
  ModelRegistry,
} from '@vitamin/ai'
import { createHookRegistry } from '@vitamin/hooks'
import {
  createToolRegistry,
  ToolRegistry,
  type CallAgent,
  type ExecuteSkill,
  type LoadSkill,
  type TaskDispatch,
} from '@vitamin/tools'
import { SESSION_MAX } from '@vitamin/env'
import { createResourceManager, SettingsManager } from '@vitamin/resources'

import { attachLogListener, createLogger } from '@vitamin/shared'
import { AgentSession } from '../session/agent-session'
import {
  CodingSessionManager,
  createDiskCodingSessionManager,
  createInMemoryCodingSessionManager,
  createRemoteCodingSessionManager,
} from '../session/coding-session-manager'


import type { AgentTool } from '@vitamin/agent'
import type { AuthStore, ProviderRegistry } from '@vitamin/ai'
import type { HookRegistry } from '@vitamin/hooks'
import type {
  AgentSessionInfo,
  AgentSessionOptions,
} from '../session/types'

import type { VitaminAppOptions, VitaminContext } from '../types'
import type { ResourceManager } from '@vitamin/resources'
export { type VitaminAppOptions, type VitaminContext } from '../types'


export class VitaminApp implements VitaminContext {
  public readonly settings: SettingsManager
  public readonly toolRegistry: ToolRegistry
  public readonly resourceManager: ResourceManager
  public readonly hookRegistry: HookRegistry
  public readonly providerRegistry: ProviderRegistry
  public readonly codingSessionManager: CodingSessionManager
  public readonly logger: ReturnType<typeof createLogger>
  public readonly workspaceDir: string
  public readonly maxSessions: number
  public readonly maxToolTurns: number

  private readonly defaultTools: AgentTool[] = []
  private readonly explicitSystemPrompt?: string
  private readonly devtools: Devtools | null = null
  private disposed = false
  private defaultToolPreset: 'minimal' | 'standard' | 'full' = 'standard'

  public get tools(): AgentTool[] {
    return this.toolRegistry.getAvailable(this.defaultToolPreset).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      visibility: tool.metadata.builtin ? 'always' : 'when-enabled',
      execute: tool.execute,
    }))
  }

  public get modelRegistry(): ModelRegistry {
    return this.providerRegistry.getModelRegistry()
  }

  public get auth(): AuthStore {
    return this.providerRegistry.getAuthStore()
  }

  public get authStore(): AuthStore {
    return this.providerRegistry.getAuthStore()
  }

  public get sessionManager(): CodingSessionManager {
    return this.codingSessionManager
  }

  private globalLogSubscription: ReturnType<typeof attachLogListener> | null = null

  constructor(options: VitaminAppOptions) {
    const {
      inspect,
      logger,
      sessionDir,
      sessionUrl,
      maxSessions,
      maxToolTurns,
      port,
      resourceManager,
      tools,
      workspaceDir,
      systemPrompt,
    } = options

    this.defaultTools = tools ?? []
    this.maxSessions = maxSessions ?? SESSION_MAX
    this.maxToolTurns = maxToolTurns ?? 10
    this.workspaceDir = workspaceDir ?? process.cwd()
    this.explicitSystemPrompt = systemPrompt
    
    this.logger = createLogger(logger.name, {
      level: logger.level,
      destination: logger.destination,
    })

    const {
      model,
      authStore,
      hookRegistry,
      modelRegistry,
      providerRegistry,
    } = options

    this.hookRegistry = hookRegistry ?? createHookRegistry({ preset: 'default' })
    this.providerRegistry = providerRegistry ?? createDefaultProviderRegistry({
      authStore,
      modelRegistry,
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

    this.settings = new SettingsManager({
      workspaceDir: this.workspaceDir
    })

    this.resourceManager = resourceManager ?? createResourceManager({
      workspaceDir: this.workspaceDir,
    })


    const managerOptions = {
      systemPrompt: ``,
      tools: [] as AgentTool[],
      maxSessions,
      maxToolTurns,
      hookRegistry: this.hookRegistry,
      providerRegistry: this.providerRegistry,
      workspaceDir: this.workspaceDir,
      logger: this.logger,
      devtools: this.devtools ?? undefined,
      promptRefresh: async () => ``,
    }

    if (sessionDir) {
      this.codingSessionManager = createDiskCodingSessionManager({
        ...managerOptions,
        sessionDir,
      })
    } else if (sessionUrl) {
      this.codingSessionManager = createRemoteCodingSessionManager({
        ...managerOptions,
        sessionUrl,
      })
    } else {
      this.codingSessionManager = createInMemoryCodingSessionManager(managerOptions)
    }

    this.toolRegistry = this.buildToolRegistry()
  }

  async start(): Promise<void> {
    this.ensureNotDisposed()

    if (this.devtools) {
      await this.devtools.start()
    }

    this.logger.info('VitaminApp started')
  }

  async stop(): Promise<void> {
    if (this.disposed) {
      return
    }

    this.settings.dispose()
    this.resourceManager.dispose()
    this.toolRegistry.dispose()
    this.codingSessionManager.dispose()

    if (this.devtools) {
      await this.devtools.stop()
    }
    if (this.globalLogSubscription) {
      this.globalLogSubscription()
      this.globalLogSubscription = null
    }

    this.disposed = true
    this.logger.info('Vitamin app stopped')
  }


  async createSession(options: Partial<AgentSessionOptions> = {}): Promise<AgentSession> {
    this.ensureNotDisposed()

    const agentSession = await this.codingSessionManager.createSession({
      ...options,
      model: options.model,
      systemPrompt: options.systemPrompt,
      tools: options.tools ?? this.defaultTools,
      workspaceDir: options.workspaceDir ?? this.workspaceDir,
      hookRegistry: this.hookRegistry,
      providerRegistry: this.providerRegistry,
      logger: this.logger,
      devtools: this.devtools ?? undefined,
      promptRefresh: async () => ``,
      maxToolTurns: options.maxToolTurns ?? this.maxToolTurns,
    })

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

  private buildToolRegistry(): ToolRegistry {
    const taskDispatch: TaskDispatch = async () => ({
      success: false,
      error: `Task dispatching is not available in this environment.`,
    })

    const callAgent: CallAgent = async () => ({
      success: false,
      error: `Calling agents is not available in this environment.`,
    })

    const loadSkill: LoadSkill = async () => ({
      success: false,
      error: `Loading skills is not available in this environment.`,
    })

    const executeSkill: ExecuteSkill = async () => ({
      success: false,
      error: `Executing skills is not available in this environment.`,
    })

    const registry = createToolRegistry(this.workspaceDir, {
      callAgent,
      loadSkill,
      executeSkill,
      dispatchTask: taskDispatch,
      sessionManager: {
        list: async () => this.listSessions().map((session) => ({
          id: session.id,
          title: session.id,
          messageCount: session.messageCount,
        })),
        create: async () => {
          const session = await this.createSession()
          return { id: session.id }
        },
        remove: async (id: string) => this.removeSession(id),
        compact: async (id: string) => {
          const session = this.getSession(id)
          if (!session) return false
          await session.compact('Compacted by session_manager tool', 1)
          return true
        },
      },
    })

    const removeCategories = ['orchestration', 'skill'] as const
    for (const category of removeCategories) {
      const names = registry.getByCategory(category).map((tool) => tool.name)
      if (names.length > 0) {
        registry.unregister(names)
      }
    }

    return registry
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error('VitaminApp has been stopped and cannot be reused.')
    }
  }
}

export function createVitamin(options: VitaminAppOptions): VitaminApp {
  return new VitaminApp(options)
}
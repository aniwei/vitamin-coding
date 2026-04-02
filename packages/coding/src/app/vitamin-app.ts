import { Devtools } from '@vitamin/devtools'
import {
  createDefaultProviderRegistry,
  ModelRegistry,
} from '@vitamin/ai'
import { createHookRegistry } from '@vitamin/hooks'
import {
  createToolRegistry,
  ToolRegistry,
  type ExecuteSkill,
  type LoadSkill,
} from '@vitamin/tools'
import { SESSION_MAX } from '@vitamin/env'
import { createResourceManager, SettingsManager } from '@vitamin/resources'
import { Orchestrator } from '@vitamin/orchestrator'

import { attachLogListener, createLogger } from '@vitamin/shared'
import { AgentSession } from '../session/agent-session'
import { getLastAssistantText } from '../modes/run-modes'
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
  private readonly devtools: Devtools | null = null
  private orchestrator!: Orchestrator
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
    } = options

    this.defaultTools = tools ?? []
    this.maxSessions = maxSessions ?? SESSION_MAX
    this.maxToolTurns = maxToolTurns ?? 10
    this.workspaceDir = workspaceDir ?? process.cwd()
    
    this.logger = createLogger(logger.name, {
      level: logger.level,
      destination: logger.destination,
    })

    const {
      model: _model,
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

  private buildRunSession() {
    return async (options: { prompt: string; sessionId?: string; sessionMode: 'ephemeral' | 'sticky' }) => {
      const startTime = Date.now()

      // sticky 模式：复用已有 session
      let session: AgentSession
      if (options.sessionMode === 'sticky' && options.sessionId) {
        const existing = this.getSession(options.sessionId)
        if (existing) {
          session = existing
        } else {
          session = await this.createSession({ id: options.sessionId })
        }
      } else {
        session = await this.createSession()
      }

      await session.prompt(options.prompt)
      const text = getLastAssistantText(session.session.messages())

      // ephemeral 模式：执行完后清理
      if (options.sessionMode === 'ephemeral') {
        await this.removeSession(session.id)
      }

      return {
        text,
        sessionId: session.id,
        durationMs: Date.now() - startTime,
      }
    }
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
    this.orchestrator.dispose()
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
    // 创建 orchestrator — 注入真实回调
    this.orchestrator = new Orchestrator({
      hookRegistry: this.hookRegistry,
      runSession: this.buildRunSession(),
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
      callAgent: this.orchestrator.callAgent,
      loadSkill,
      executeSkill,
      dispatchTask: this.orchestrator.dispatchTask,
      createTask: this.orchestrator.createTask,
      getTask: this.orchestrator.getTask,
      listTasks: this.orchestrator.listTasks,
      updateTask: this.orchestrator.updateTask,
      getBackgroundOutput: this.orchestrator.getBackgroundOutput,
      cancelBackground: this.orchestrator.cancelBackground,
      clarifyRequest: this.orchestrator.clarifyRequest,
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

    // 仅移除 skill 类别工具（orchestration 工具现在有真实回调，保留）
    const skillTools = registry.getByCategory('skill').map((tool) => tool.name)
    if (skillTools.length > 0) {
      registry.unregister(skillTools)
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
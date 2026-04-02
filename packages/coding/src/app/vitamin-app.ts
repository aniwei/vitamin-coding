import { Devtools } from '@vitamin/devtools'
import {
  createModelSlot,
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
import { FileStateManager, OperationalLearningStore } from '@vitamin/memory'

import { attachLogListener, createLogger, type Logger } from '@vitamin/shared'
import { AgentSession } from '../session/agent-session'
import { getLastAssistantText } from '../modes/run-modes'
import {
  CodingSessionManager,
  createDiskCodingSessionManager,
  createInMemoryCodingSessionManager,
  createRemoteCodingSessionManager,
} from '../session/coding-session-manager'
import {
  PromptManager,
  createPromptProvider,
  buildLessonInjection,
  extractPhaseFromMessage,
  injectPhaseContext,
  SESSION_END_LEARNING_PROMPT,
  BUILTIN_PROMPTS_DIR,
} from '@vitamin/prompt'
import type { PhaseAnnotation } from '@vitamin/prompt'


import type { AgentTool } from '@vitamin/agent'
import type { AuthStore, Model, ProviderRegistry, WorkflowSlot } from '@vitamin/ai'
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
  public readonly logger: Logger

  public readonly workspaceDir: string
  public readonly maxSessions: number
  public readonly maxToolTurns: number

  private readonly devtools: Devtools | null = null
  private readonly fileStateManager: FileStateManager
  private readonly learningStore: OperationalLearningStore
  private readonly promptManager: PromptManager

  private readonly orchestrator: Orchestrator
  
  private defaultToolPreset: 'minimal' | 'standard' | 'full' = 'full'
  private disposed = false
  private settingsLoaded = false

  private readonly phaseTracker = new Map<string, string[]>()
  private readonly learningTriggeredSessions = new Set<string>()

  public get tools(): AgentTool[] {
    return this.toolRegistry.getAvailable(this.defaultToolPreset).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      readonly: tool.readonly,
      visibility: tool.metadata.builtin ? 'always' : 'when-enabled',
      execute: tool.execute,
    }))
  }

  public get modelRegistry(): ModelRegistry {
    return this.providerRegistry.getModelRegistry()
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
      projectConfigPath,
      sessionDir,
      sessionUrl,
      maxSessions,
      maxToolTurns,
      port,
      workspaceDir,
      resourceManager,
    } = options

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
    const defaultModel = _model ?? (options.modelId ? this.providerRegistry.resolveModel(options.modelId) : undefined)

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
      workspaceDir: this.workspaceDir,
      projectConfigPath,
    })

    this.settings.on('change', (config) => {
      this.settingsLoaded = true

      if (config.tool_preset) {
        this.defaultToolPreset = config.tool_preset
      }
    })

    this.resourceManager = resourceManager ?? createResourceManager({
      workspaceDir: this.workspaceDir,
    })

    // 初始化 FileStateManager 和 OperationalLearningStore
    this.fileStateManager = new FileStateManager()
    this.learningStore = new OperationalLearningStore({
      filePath: `${this.workspaceDir}/.vitamin/lessons.json`,
    })

    // 初始化 PromptManager（默认使用内置 prompts 目录）
    const promptProvider = createPromptProvider(
      options.prompt ?? {
        type: 'local',
        baseDir: BUILTIN_PROMPTS_DIR,
      },
    )
    
    this.promptManager = new PromptManager({ provider: promptProvider })
    const promptRefresh = () => this.promptManager.assemble()

    const managerOptions = {
      model: defaultModel,
      systemPrompt: ``,
      tools: [] as AgentTool[],
      maxSessions,
      maxToolTurns,
      hookRegistry: this.hookRegistry,
      providerRegistry: this.providerRegistry,
      workspaceDir: this.workspaceDir,
      logger: this.logger,
      devtools: this.devtools ?? undefined,
      promptRefresh,
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

    const run = async (options: {
      prompt: string
      sessionId?: string
      sessionMode: 'ephemeral' | 'sticky'
      agentName?: string
      slot?: WorkflowSlot
    }) => {
      const startTime = Date.now()

      let session: AgentSession
      if (options.sessionMode === 'sticky' && options.sessionId) {
        const existing = this.getSession(options.sessionId)
        if (existing) {
          session = existing
        } else {
          session = await this.createSession({
            id: options.sessionId,
            agentName: options.agentName,
            slot: options.slot,
          })
        }
      } else {
        session = await this.createSession({
          agentName: options.agentName,
          slot: options.slot,
        })
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

    // 创建 orchestrator — 注入真实回调
    this.orchestrator = new Orchestrator({
      hookRegistry: this.hookRegistry,
      runSession: run,
    })

    const loadSkill: LoadSkill = async () => ({
      success: false,
      error: `Loading skills is not available in this environment.`,
    })

    const executeSkill: ExecuteSkill = async () => ({
      success: false,
      error: `Executing skills is not available in this environment.`,
    })

    this.toolRegistry = createToolRegistry(this.workspaceDir, {
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
      captureFileState: async (input) => {
        const snapshot = await this.fileStateManager.capture({
          workspaceDir: this.workspaceDir,
          recentFiles: input.recentFiles,
          planStatus: input.planStatus,
        })
        return {
          success: true,
          summary: this.fileStateManager.formatSnapshot(snapshot),
          timestamp: snapshot.timestamp,
        }
      },
      learn: async (lesson) => {
        const saved = await this.learningStore.save({
          tags: lesson.tags,
          trigger: lesson.trigger,
          insight: lesson.insight,
          sourceSessionId: lesson.sessionId,
        })
        return { success: true, lessonId: saved.id }
      },
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
        }
      }
    })

    // 仅移除 skill 类别工具（orchestration 工具现在有真实回调，保留）
    const skillTools = this.toolRegistry.getByCategory('skill').map((tool) => tool.name)
    if (skillTools.length > 0) {
      this.toolRegistry.unregister(skillTools)
    }

    // 注册 hooks
    this.registerHooks()
  }

  private async ensureSettingsLoaded(): Promise<void> {
    if (this.settingsLoaded) {
      return
    }

    await this.settings.load()
    this.settingsLoaded = true
  }

  private resolveWorkflowSlot(
    agentName?: string,
    slot?: WorkflowSlot,
  ): WorkflowSlot | undefined {
    if (slot) {
      return slot
    }

    if (!agentName) {
      return undefined
    }

    return this.settings.get('agents')?.[agentName]?.default_workflow_slot
  }

  private resolveModelFromSlot(slot?: WorkflowSlot): Model | undefined {
    const modelSlots = this.settings.get('model_slots')
    const defaultSpec = modelSlots?.default ?? this.settings.get('model')
    if (!defaultSpec) {
      return undefined
    }

    const modelSlot = createModelSlot({
      slots: modelSlots?.slots ?? {},
      default: defaultSpec,
    }, this.modelRegistry)

    return modelSlot.resolve(slot)
  }

  private async resolveSessionModel(options: {
    model?: Model
    agentName?: string
    slot?: WorkflowSlot
  }): Promise<Model> {
    if (options.model) {
      return options.model
    }

    await this.ensureSettingsLoaded()

    const workflowSlot = this.resolveWorkflowSlot(options.agentName, options.slot)
    const slotModel = this.resolveModelFromSlot(workflowSlot)
    if (slotModel) {
      return slotModel
    }

    const configuredModel = this.settings.get('model')
    if (configuredModel) {
      return this.providerRegistry.resolveModel(configuredModel)
    }

    throw new Error('No model specified for session and no default model configured.')
  }

  async start(): Promise<void> {
    this.ensureNotDisposed()
    await this.ensureSettingsLoaded()

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
    await this.ensureSettingsLoaded()

    const model = await this.resolveSessionModel({
      model: options.model,
      agentName: options.agentName,
      slot: options.slot,
    })

    // 读取 per-agent 配置（system_prompt / tools / max_tool_turns）
    const agentConfig = options.agentName
      ? this.settings.get('agents')?.[options.agentName]
      : undefined

    const agentSystemPrompt = agentConfig?.system_prompt
    const agentMaxToolTurns = agentConfig?.max_tool_turns
    const agentToolNames = agentConfig?.tools

    // 如果 agent 配置了 tools 白名单，则过滤工具列表
    let tools = options.tools ?? this.tools
    if (agentToolNames && agentToolNames.length > 0) {
      const nameSet = new Set(agentToolNames)
      tools = tools.filter(t => nameSet.has(t.name))
    }

    const agentSession = await this.codingSessionManager.createSession({
      ...options,
      model,
      systemPrompt: options.systemPrompt ?? agentSystemPrompt,
      tools,
      workspaceDir: options.workspaceDir ?? this.workspaceDir,
      hookRegistry: this.hookRegistry,
      providerRegistry: this.providerRegistry,
      logger: this.logger,
      devtools: this.devtools ?? undefined,
      promptRefresh: options.promptRefresh ?? (() => this.promptManager.assemble()),
      maxToolTurns: options.maxToolTurns ?? agentMaxToolTurns ?? this.maxToolTurns,
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

  private registerHooks(): void {
    // system-prompt.transform: 注入相关历史经验到 system prompt
    this.hookRegistry.on('system-prompt.transform', 'lesson-injection', async (_input, output) => {
      const lessons = await this.learningStore.list()
      if (lessons.length > 0) {
        const injection = buildLessonInjection(lessons)
        if (injection) {
          output.systemPrompt = `${output.systemPrompt}\n\n${injection}`
        }
      }
    }, 40)

    // system-prompt.transform: 注入当前 phase 上下文
    this.hookRegistry.on('system-prompt.transform', 'phase-injection', async (input, output) => {
      const history = this.phaseTracker.get(input.sessionId)
      const currentPhase = history?.[history.length - 1]
      if (history && history.length > 0 && currentPhase) {
        const annotation: PhaseAnnotation = {
          currentPhase,
          phaseHistory: history,
        }
        output.systemPrompt = injectPhaseContext(output.systemPrompt, annotation)
      }
    }, 30)

    // chat.message.after: 从 LLM 回复中提取 phase 标注并存储
    this.hookRegistry.on('chat.message.after', 'phase-extraction', async (input) => {
      const message = input.message
      if (message.role === 'assistant' && message.content) {
        for (const part of message.content) {
          if (part.type === 'text') {
            const phase = extractPhaseFromMessage(part.text)
            if (phase) {
              const history = this.phaseTracker.get(input.sessionId) ?? []
              history.push(phase)
              this.phaseTracker.set(input.sessionId, history)
              this.logger.debug('Phase extracted: %s (session=%s)', phase, input.sessionId)
            }
          }
        }
      }
    }, 50)

    // session.idle: 触发经验提取（每个 session 仅触发一次）
    this.hookRegistry.on('session.idle', 'session-end-learning', async (input) => {
      if (this.learningTriggeredSessions.has(input.sessionId)) {
        return
      }
      const session = this.getSession(input.sessionId)
      if (!session) {
        return
      }
      const messageCount = session.session.messages().length
      if (messageCount < 6) {
        return
      }
      this.learningTriggeredSessions.add(input.sessionId)
      this.logger.info('Session idle, prompting for learning: %s', input.sessionId)
      try {
        await session.prompt(SESSION_END_LEARNING_PROMPT)
      } catch (err) {
        this.logger.warn('Learning prompt failed for session %s: %s', input.sessionId, err)
      }
    }, 50)
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
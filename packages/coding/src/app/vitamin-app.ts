import { Devtools } from '@vitamin/devtools'
import {
  createModelSlot,
  createDefaultProviderRegistry,
  ModelRegistry,
} from '@vitamin/ai'
import {
  createHookRegistry,
  PermissionPolicyRegistry,
  PermissionAuditLog,
  createPermissionGuardHook,
  createPermissionToolSetsFromRegistry,
  createPermissionModePolicy,
  createDisabledToolsPolicy,
  compilePolicyFromSetting,
  createPermissionRegistry,
} from '@vitamin/hooks'
import type { PermissionMode, PermissionPolicySetting } from '@vitamin/hooks'
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
  resolveAgentProfile,
  resolveAgentToolNames,
  createPromptProvider,
  buildLessonInjection,
  extractPhaseFromMessage,
  injectPhaseContext,
  collectEnvironment,
  formatEnvironmentBlock,
  BUILTIN_PROMPTS_DIR,
} from '@vitamin/prompt'
import type {
  AgentProfile,
  PhaseAnnotation,
  SubAgentPromptContext,
} from '@vitamin/prompt'
import { BUILTIN_AGENT_PROFILES } from '@vitamin/setting'

import type { AgentTool } from '@vitamin/agent'
import type {
  AuthStore,
  Model,
  ProviderRegistry,
  WorkflowSlot,
} from '@vitamin/ai'
import type { HookRegistry } from '@vitamin/hooks'
import type {
  AgentSessionInfo,
  AgentSessionOptions,
  ResolvedSessionConfig,
} from '../session/types'

import type { VitaminAppOptions, VitaminContext } from '../types'
import type { ResourceManager } from '@vitamin/resources'
export { type VitaminAppOptions, type VitaminContext } from '../types'

function filterToolsByNames(tools: AgentTool[], names: string[]): AgentTool[] {
  const nameSet = new Set(names)
  return tools.filter((tool) => nameSet.has(tool.name))
}

const TIER_TO_SLOT: Record<string, WorkflowSlot> = {
  fast: 'compact',
  standard: 'normal',
  powerful: 'thinking',
}

// agent 来源：从 settings + 内置 profile 读取，纯同步，无决策逻辑
interface AgentSources {
  slot?: WorkflowSlot // agentConfig.default_workflow_slot
  profileTier?: string // agentProfile.preferredModelTier（需映射为 slot）
  toolNames?: string[] // agentConfig.tools ?? agentProfile.defaultTools
  systemPrompt?: string // agentConfig.system_prompt
  maxToolTurns?: number // agentConfig.max_tool_turns ?? agentProfile.defaultMaxToolTurns
  profile?: AgentProfile // 供 prompt 组装使用
}

export class VitaminApp implements VitaminContext {
  public readonly settings: SettingsManager
  public readonly toolRegistry: ToolRegistry
  public readonly resourceManager: ResourceManager
  public readonly hookRegistry: HookRegistry
  public readonly providerRegistry: ProviderRegistry
  public readonly codingSessionManager: CodingSessionManager
  public readonly permissionRegistry: PermissionPolicyRegistry
  public readonly auditLog: PermissionAuditLog
  public readonly logger: Logger

  public readonly workspaceDir: string
  public readonly maxSessions: number
  public readonly maxToolTurns: number

  public readonly devtools: Devtools | null = null

  private readonly fileStateManager: FileStateManager
  private readonly learningStore: OperationalLearningStore
  private readonly promptManager: PromptManager
  private readonly defaultModel?: Model

  private readonly orchestrator: Orchestrator

  private disposed = false
  private settingsLoaded = false
  private defaultToolPreset: 'minimal' | 'standard' | 'full' = 'full'

  private readonly phaseTracker = new Map<string, string[]>()
  private readonly learningTriggeredSessions = new Set<string>()

  public get tools(): AgentTool[] {
    return this.toolRegistry
      .getAvailable(this.defaultToolPreset)
      .map((tool) => ({
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

  private globalLogSubscription: ReturnType<typeof attachLogListener> | null =
    null

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

    const { model, authStore, hookRegistry, modelRegistry, providerRegistry } =
      options

    this.hookRegistry =
      hookRegistry ?? createHookRegistry({ preset: 'default' })
    this.providerRegistry =
      providerRegistry ??
      createDefaultProviderRegistry({
        authStore,
        modelRegistry,
      })

    const defaultModel =
      model ??
      (options.modelId
        ? this.providerRegistry.resolveModel(options.modelId)
        : undefined)
    this.defaultModel = defaultModel

    if (inspect) {
      this.devtools = new Devtools({ port })

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

    this.settings.on('change', (setting) => {
      this.settingsLoaded = true

      if (setting.tool_preset) {
        this.defaultToolPreset = setting.tool_preset
      }

      this.updatePermissionPolicies(setting)
    })

    this.resourceManager =
      resourceManager ??
      createResourceManager({
        workspaceDir: this.workspaceDir,
      })

    // 初始化 FileStateManager 和 OperationalLearningStore
    this.fileStateManager = new FileStateManager()
    this.learningStore = new OperationalLearningStore({
      path: `${this.workspaceDir}/.vitamin/lessons.json`,
    })

    // 初始化 PromptManager（默认使用内置 prompts 目录）
    const promptProvider = createPromptProvider(
      options.prompt ?? {
        type: 'local',
        baseDir: BUILTIN_PROMPTS_DIR,
      },
    )

    this.promptManager = new PromptManager({ provider: promptProvider })

    // configProvider 仅供 restore / restoreAll 路径使用；
    // 正常 createSession 路径会通过 resolveSessionConfig 完整解析。
    // 使用 factory function 而非静态快照，确保每次 restore 拿到最新配置。
    const configProvider: (() => ResolvedSessionConfig) | undefined =
      defaultModel
        ? () => ({
            model: defaultModel,
            systemPrompt: '',
            tools: [],
            thinkingLevel: 'medium' as const,
            maxToolTurns: this.maxToolTurns,
            promptRefresh: () =>
              this.promptManager.assemblePreset({ preset: 'main' }),
            workspaceDir: this.workspaceDir,
          })
        : undefined

    const managerOptions = {
      maxSessions,
      hookRegistry: this.hookRegistry,
      providerRegistry: this.providerRegistry,
      logger: this.logger,
      devtools: this.devtools ?? undefined,
      configProvider,
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
      this.codingSessionManager =
        createInMemoryCodingSessionManager(managerOptions)
    }

    const run = async (options: {
      prompt: string
      sessionId?: string
      sessionMode: 'ephemeral' | 'sticky'
      agentName?: string
      slot?: WorkflowSlot
      promptContext?: SubAgentPromptContext
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
            promptContext: options.promptContext,
          })
        }
      } else {
        session = await this.createSession({
          agentName: options.agentName,
          slot: options.slot,
          promptContext: options.promptContext,
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
      writeTodos: this.orchestrator.writeTodos,
      sessionManager: {
        list: async () =>
          this.listSessions().map((session) => ({
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
    const skillTools = this.toolRegistry
      .getByCategory('skill')
      .map((tool) => tool.name)
    if (skillTools.length > 0) {
      this.toolRegistry.unregister(skillTools)
    }

    // 初始化权限系统（基于当前 toolRegistry 动态推导读/写工具集合）
    const permissionToolSets = createPermissionToolSetsFromRegistry(
      this.toolRegistry.getAll(),
    )
    this.auditLog = new PermissionAuditLog()
    this.permissionRegistry = createPermissionRegistry({
      toolSets: permissionToolSets,
    })
    this.hookRegistry.register(
      createPermissionGuardHook(this.permissionRegistry, this.auditLog),
    )

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

  // ── Layer 1: Source reader ───────────────────────────────────────────────
  // 只读配置，不做任何优先级判断
  private readAgentSources(
    agentName: string | undefined,
    promptPreset: 'main' | 'subagent',
  ): AgentSources {
    const userSetting = agentName
      ? this.settings.get('agents')?.[agentName]
      : undefined

    const profile =
      promptPreset === 'subagent' && agentName
        ? resolveAgentProfile(BUILTIN_AGENT_PROFILES, agentName)
        : undefined

    return {
      slot: userSetting?.default_workflow_slot,
      profileTier: profile?.preferredModelTier,
      toolNames:
        userSetting?.tools ?? resolveAgentToolNames(profile?.defaultTools),
      systemPrompt: userSetting?.system_prompt,
      maxToolTurns: userSetting?.max_tool_turns ?? profile?.defaultMaxToolTurns,
      profile,
    }
  }

  // ── Layer 2a: Model resolver ─────────────────────────────────────────────
  // 优先级（高 → 低）：
  //   ① options.model（调用方显式指定）
  //   ② model_slots[slot]（按 slot 查表）
  //   ③ model_slots.default / settings.model（全局默认，无 slot 时也走这里）
  //   ④ this.defaultModel（构造时传入的兜底）
  private resolveModel(
    explicitModel: Model | undefined,
    slot: WorkflowSlot | undefined,
  ): Model {
    if (explicitModel) return explicitModel

    const modelSlots = this.settings.get('model_slots')
    const globalModel = this.settings.get('model')
    const defaultSpec = modelSlots?.default ?? globalModel

    if (defaultSpec) {
      return createModelSlot(
        { slots: modelSlots?.slots ?? {}, default: defaultSpec },
        this.modelRegistry,
      ).resolve(slot)
    }

    if (this.defaultModel) return this.defaultModel

    throw new Error(
      'No model configured. Set model in .vitamin/config.jsonc or pass modelId to createVitamin().',
    )
  }

  // ── Layer 2b: Tools resolver ─────────────────────────────────────────────
  // ① options.tools → 完全 override，忽略 agent 配置
  // ② agentToolNames → 从全量工具中按白名单过滤
  // ③ 全量工具
  private resolveTools(
    explicitTools: AgentTool[] | undefined,
    agentToolNames: string[] | undefined,
  ): AgentTool[] {
    if (explicitTools) return explicitTools
    if (agentToolNames?.length)
      return filterToolsByNames(this.tools, agentToolNames)
    return this.tools
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

  async createSession(
    options: Partial<AgentSessionOptions> = {},
  ): Promise<AgentSession> {
    this.ensureNotDisposed()
    await this.ensureSettingsLoaded()

    const config = await this.resolveSessionConfig(options)
    const agentSession = await this.codingSessionManager.createSession(config)

    this.logger.info('Session created: %s', agentSession.id)
    return agentSession
  }

  /**
   * ── Layer 3: Session config assembler ────────────────────────────────────
   * 唯一做优先级 merge 的地方，每个字段的来源一目了然。
   *
   * 优先级（高 → 低）：
   *   model:        options.model > slot(model_slots) > settings.model > defaultModel
   *   slot:         options.slot > agentConfig.slot > agentProfile.tier → slot
   *   tools:        options.tools > agentConfig.tools 过滤 > agentProfile.tools 过滤 > 全量
   *   systemPrompt: options.systemPrompt > agentConfig.system_prompt > promptRefresh()
   *   maxToolTurns: options.maxToolTurns > agentConfig > agentProfile > VitaminApp.maxToolTurns
   */
  private async resolveSessionConfig(
    options: Partial<AgentSessionOptions>,
  ): Promise<ResolvedSessionConfig & { id?: string }> {
    const promptPreset =
      options.promptPreset ?? (options.agentName ? 'subagent' : 'main')

    // Layer 1: 读取所有来源（纯同步，无决策）
    const agent = this.readAgentSources(options.agentName, promptPreset)

    // slot 合并：调用方 > agentConfig > agentProfile.tier 映射
    const slot =
      options.slot ?? agent.slot ?? TIER_TO_SLOT[agent.profileTier ?? '']

    // Layer 2: 各字段独立决策
    const model = this.resolveModel(options.model, slot)
    const tools = this.resolveTools(options.tools, agent.toolNames)

    // ── Prompt ──────────────────────────────────────────────────────────────
    const promptRefresh =
      options.promptRefresh ??
      (async () => {
        if (options.systemPrompt !== undefined) return options.systemPrompt
        if (agent.systemPrompt !== undefined) return agent.systemPrompt

        if (promptPreset === 'subagent' && options.agentName) {
          return this.promptManager.assemblePreset({
            preset: 'subagent',
            agentName: options.agentName,
            profile: agent.profile,
            context: options.promptContext,
          })
        }

        return this.promptManager.assemblePreset({ preset: 'main' })
      })

    const initialSystemPrompt =
      options.systemPrompt ?? agent.systemPrompt ?? (await promptRefresh())

    return {
      id: options.id,
      model,
      agentName: options.agentName,
      systemPrompt: initialSystemPrompt ?? '',
      tools,
      thinkingLevel: options.thinkingLevel ?? 'medium',
      maxToolTurns:
        options.maxToolTurns ?? agent.maxToolTurns ?? this.maxToolTurns,
      promptRefresh,
      workspaceDir: options.workspaceDir ?? this.workspaceDir,
    }
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

  async forkSession(
    sourceId: string,
    newId?: string,
  ): Promise<AgentSession | undefined> {
    return this.codingSessionManager.forkSession(sourceId, newId)
  }

  private registerHooks(): void {
    // system-prompt.transform: 注入工具 snippet / guideline 到 system prompt
    this.hookRegistry.on(
      'system-prompt.transform',
      'tool-guidance-injection',
      async (_input, output) => {
        const guidance = this.toolRegistry.buildToolGuidance(
          this.defaultToolPreset,
        )
        if (guidance) {
          output.systemPrompt = `${output.systemPrompt}\n\n${guidance}`
        }
      },
      20,
    )

    // system-prompt.transform: 注入运行时环境上下文（工作目录、git 状态、日期）
    this.hookRegistry.on(
      'system-prompt.transform',
      'environment-injection',
      async (_input, output) => {
        const exec = async (cmd: string, cwd: string) => {
          const { execSync } = await import('node:child_process')
          return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 5000 })
        }
        try {
          const env = await collectEnvironment(this.workspaceDir, exec)
          const block = formatEnvironmentBlock(env)
          output.systemPrompt = `${output.systemPrompt}\n\n${block}`
        } catch {
          // 环境收集失败不应中断 prompt 组装
        }
      },
      25,
    )

    // system-prompt.transform: 注入相关历史经验到 system prompt
    this.hookRegistry.on(
      'system-prompt.transform',
      'lesson-injection',
      async (_input, output) => {
        const lessons = await this.learningStore.list()
        if (lessons.length > 0) {
          const template =
            (await this.promptManager.loadRuntimeLessonsTemplate()) ?? undefined
          const injection = buildLessonInjection(lessons, template)
          if (injection) {
            output.systemPrompt = `${output.systemPrompt}\n\n${injection}`
          }
        }
      },
      40,
    )

    // system-prompt.transform: 注入当前 phase 上下文
    this.hookRegistry.on(
      'system-prompt.transform',
      'phase-injection',
      async (input, output) => {
        const history = this.phaseTracker.get(input.sessionId)
        const currentPhase = history?.[history.length - 1]
        if (history && history.length > 0 && currentPhase) {
          const annotation: PhaseAnnotation = {
            currentPhase,
            phaseHistory: history,
          }
          output.systemPrompt = injectPhaseContext(
            output.systemPrompt,
            annotation,
          )
        }
      },
      30,
    )

    // chat.message.after: 从 LLM 回复中提取 phase 标注并存储
    this.hookRegistry.on(
      'chat.message.after',
      'phase-extraction',
      async (input) => {
        const message = input.message
        if (message.role === 'assistant' && message.content) {
          for (const part of message.content) {
            if (part.type === 'text') {
              const phase = extractPhaseFromMessage(part.text)
              if (phase) {
                const history = this.phaseTracker.get(input.sessionId) ?? []
                history.push(phase)
                this.phaseTracker.set(input.sessionId, history)
                this.logger.debug(
                  'Phase extracted: %s (session=%s)',
                  phase,
                  input.sessionId,
                )
              }
            }
          }
        }
      },
      50,
    )

    // session.idle: 触发经验提取（每个 session 仅触发一次）
    this.hookRegistry.on(
      'session.idle',
      'session-end-learning',
      async (input) => {
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
        this.logger.info(
          'Session idle, prompting for learning: %s',
          input.sessionId,
        )
        try {
          const sessionEndPrompt =
            await this.promptManager.loadSessionEndLearningPrompt()
          await session.prompt(sessionEndPrompt ?? '')
        } catch (err) {
          this.logger.warn(
            'Learning prompt failed for session %s: %s',
            input.sessionId,
            err,
          )
        }
      },
      50,
    )
  }

  private updatePermissionPolicies(setting: {
    permission_mode?: PermissionMode
    permissions?: PermissionPolicySetting[]
    disabled_tools?: string[]
  }): void {
    const permissionToolSets = createPermissionToolSetsFromRegistry(
      this.toolRegistry.getAll(),
    )

    // 1. permission_mode 变更 → 重新注册 mode 策略
    if (setting.permission_mode) {
      this.permissionRegistry.unregister('mode::bypass')
      this.permissionRegistry.unregister('mode::auto')
      this.permissionRegistry.unregister('mode::confirm')
      this.permissionRegistry.unregister('mode::strict')
      this.permissionRegistry.unregister('mode::readonly')
      this.permissionRegistry.register(
        createPermissionModePolicy(setting.permission_mode, permissionToolSets),
      )
    }

    // 2. disabled_tools 变更 → 重新注册 disabled-tools 策略
    if (setting.disabled_tools && setting.disabled_tools.length > 0) {
      this.permissionRegistry.unregister('setting::disabled-tools')
      this.permissionRegistry.register(
        createDisabledToolsPolicy(setting.disabled_tools),
      )
    } else {
      this.permissionRegistry.unregister('setting::disabled-tools')
    }

    // 3. 用户自定义策略 → 先清除旧的 user:: 前缀策略，再编译注册
    for (const p of this.permissionRegistry.getAll()) {
      if (p.name.startsWith('user::')) {
        this.permissionRegistry.unregister(p.name)
      }
    }

    if (setting.permissions) {
      for (const pc of setting.permissions) {
        const policy = compilePolicyFromSetting({
          ...pc,
          name: `user::${pc.name}`,
        })
        this.permissionRegistry.register(policy)
      }
    }

    this.logger.debug(
      'Permission policies synced: %d policies active',
      this.permissionRegistry.getAll().length,
    )
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

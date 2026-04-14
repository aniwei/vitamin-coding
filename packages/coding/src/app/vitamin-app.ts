import { Devtools } from '@vitamin/devtools'
import { createModelSlot, createDefaultProviderRegistry, ModelRegistry } from '@vitamin/ai'
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
import { createToolRegistry, ToolRegistry, type ExecuteSkill, type LoadSkill } from '@vitamin/tools'
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
  createToolGuidanceHook,
  createEnvironmentInjectionHook,
  createLessonInjectionHook,
  createPhaseTrackingHooks,
  createSessionLearningHooks,
} from '../hooks'
import {
  PromptManager,
  resolveAgentProfile,
  resolveAgentToolNames,
  createPromptProvider,
  BUILTIN_PROMPTS_DIR,
} from '@vitamin/prompt'
import type { AgentProfile, SubAgentPromptContext } from '@vitamin/prompt'
import { BUILTIN_AGENT_PROFILES } from '@vitamin/setting'

import type { AgentTool } from '@vitamin/agent'
import type { AuthStore, Model, ProviderRegistry, WorkflowSlot } from '@vitamin/ai'
import type { HookRegistry } from '@vitamin/hooks'
import type { AgentSessionInfo, AgentSessionOptions, ResolvedSessionConfig } from '../session/types'

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
  private currentPermissionMode: PermissionMode = 'auto'

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

    const { model, authStore, hookRegistry, modelRegistry, providerRegistry } = options

    this.hookRegistry = hookRegistry ?? createHookRegistry({ preset: 'default' })
    this.providerRegistry =
      providerRegistry ??
      createDefaultProviderRegistry({
        authStore,
        modelRegistry,
      })

    const defaultModel =
      model ?? (options.modelId ? this.providerRegistry.resolveModel(options.modelId) : undefined)
    this.defaultModel = defaultModel

    if (inspect) {
      this.devtools = new Devtools({ port })

      this.globalLogSubscription = attachLogListener((data) => {
        if (
          typeof data === 'object' &&
          data !== null &&
          'name' in data &&
          'level' in data &&
          'msg' in data
        ) {
          const log = data as { name: string; level: string; msg: string }
          if (log.name === logger.name) {
            this.devtools?.sendLog(log)
          }
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

    this.fileStateManager = new FileStateManager()
    this.learningStore = new OperationalLearningStore({
      path: `${this.workspaceDir}/.vitamin/lessons.json`,
    })

    const promptProvider = createPromptProvider(
      options.prompt ?? {
        type: 'local',
        baseDir: BUILTIN_PROMPTS_DIR,
      },
    )

    this.promptManager = new PromptManager({ provider: promptProvider })

    this.codingSessionManager = this.initSessionManager(options, defaultModel)
    this.orchestrator = this.initOrchestrator()
    this.toolRegistry = this.initToolRegistry(options)
    const { permissionRegistry, auditLog } = this.initPermissions()
    this.permissionRegistry = permissionRegistry
    this.auditLog = auditLog

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
    const userSetting = agentName ? this.settings.get('agents')?.[agentName] : undefined

    const profile =
      promptPreset === 'subagent' && agentName
        ? resolveAgentProfile(BUILTIN_AGENT_PROFILES, agentName)
        : undefined

    return {
      slot: userSetting?.default_workflow_slot,
      profileTier: profile?.preferredModelTier,
      toolNames: userSetting?.tools ?? resolveAgentToolNames(profile?.defaultTools),
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
  private resolveModel(explicitModel: Model | undefined, slot: WorkflowSlot | undefined): Model {
    if (explicitModel) {
      return explicitModel
    }

    const modelSlots = this.settings.get('model_slots')
    const globalModel = this.settings.get('model')
    const defaultSpec = modelSlots?.default ?? globalModel

    if (defaultSpec) {
      return createModelSlot(
        { slots: modelSlots?.slots ?? {}, default: defaultSpec },
        this.modelRegistry,
      ).resolve(slot)
    }

    if (this.defaultModel) {
      return this.defaultModel
    }

    throw new Error(
      'No model configured. Set model in .vitamin/config.jsonc or pass modelId to createVitamin().',
    )
  }

  // ── Layer 2b: Tools resolver ─────────────────────────────────────────────
  // options.tools → 完全 override，忽略 agent 配置
  // agentToolNames → 从全量工具中按白名单过滤
  // 全量工具
  private resolveTools(
    explicitTools: AgentTool[] | undefined,
    agentToolNames: string[] | undefined,
  ): AgentTool[] {
    if (explicitTools) {
      return explicitTools
    }
    if (agentToolNames?.length) {
      return filterToolsByNames(this.tools, agentToolNames)
    }
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

  async createSession(options: Partial<AgentSessionOptions> = {}): Promise<AgentSession> {
    this.ensureNotDisposed()
    await this.ensureSettingsLoaded()

    const config = await this.resolveSessionConfig(options)
    const agentSession = await this.codingSessionManager.createSession(config)

    this.logger.info({ sessionId: agentSession.id }, 'Session created')
    return agentSession
  }

  /**
   * ── Layer 3: Session config assembler ────────────────────────────────────
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
    const promptPreset = options.promptPreset ?? (options.agentName ? 'subagent' : 'main')

    const agent = this.readAgentSources(options.agentName, promptPreset)

    // slot 优先级：调用方 > agentConfig > agentProfile.tier 映射
    const slot = options.slot ?? agent.slot ?? TIER_TO_SLOT[agent.profileTier ?? '']

    const model = this.resolveModel(options.model, slot)
    const tools = this.resolveTools(options.tools, agent.toolNames)

    const promptRefresh =
      options.promptRefresh ??
      (async () => {
        if (options.systemPrompt !== undefined) {
          return options.systemPrompt
        }
        if (agent.systemPrompt !== undefined) {
          return agent.systemPrompt
        }

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
      maxToolTurns: options.maxToolTurns ?? agent.maxToolTurns ?? this.maxToolTurns,
      promptRefresh,
      workspaceDir: options.workspaceDir ?? this.workspaceDir,
    }
  }

  getSession(id: string): AgentSession | undefined {
    return this.codingSessionManager.getSession(id)
  }

  getActiveSession(): AgentSession | undefined {
    return this.codingSessionManager.active
  }

  listSessions(): AgentSessionInfo[] {
    return this.codingSessionManager.listSessions()
  }

  async removeSession(id: string): Promise<boolean> {
    const removed = await this.codingSessionManager.removeSession(id)
    if (removed) {
      this.logger.info({ sessionId: id }, 'Session removed')
    }
    return removed
  }

  async forkSession(sourceId: string, newId?: string): Promise<AgentSession | undefined> {
    return this.codingSessionManager.forkSession(sourceId, newId)
  }

  // ── Private init methods ─────────────────────────────────────────────────

  /**
   * SessionManager: configProvider 仅供 restore 路径使用，
   * 正常 createSession 走 resolveSessionConfig 完整解析。
   */
  private initSessionManager(
    options: VitaminAppOptions,
    defaultModel: Model | undefined,
  ): CodingSessionManager {
    // configProvider 仅供 restore / restoreAll 路径使用
    const configProvider: (() => ResolvedSessionConfig) | undefined = defaultModel
      ? () => ({
          model: defaultModel,
          systemPrompt: '',
          tools: [],
          thinkingLevel: 'medium' as const,
          maxToolTurns: this.maxToolTurns,
          promptRefresh: () => this.promptManager.assemblePreset({ preset: 'main' }),
          workspaceDir: this.workspaceDir,
        })
      : undefined

    const managerOptions = {
      maxSessions: options.maxSessions,
      hookRegistry: this.hookRegistry,
      providerRegistry: this.providerRegistry,
      logger: this.logger,
      devtools: this.devtools ?? undefined,
      configProvider,
    }

    if (options.sessionDir) {
      return createDiskCodingSessionManager({
        ...managerOptions,
        sessionDir: options.sessionDir,
      })
    }

    if (options.sessionUrl) {
      if (!options.sessionFetch || !options.sessionGetAuth) {
        throw new Error(
          'sessionFetch and sessionGetAuth are required when using sessionUrl. ' +
            'Pass them in VitaminAppOptions.',
        )
      }
      return createRemoteCodingSessionManager({
        ...managerOptions,
        sessionUrl: options.sessionUrl,
        fetch: options.sessionFetch,
        getAuth: options.sessionGetAuth,
        timeoutMs: options.sessionTimeoutMs,
      })
    }

    return createInMemoryCodingSessionManager(managerOptions)
  }

  private initOrchestrator(): Orchestrator {
    const run = async (runOptions: {
      prompt: string
      sessionId?: string
      sessionMode: 'ephemeral' | 'sticky'
      agentName?: string
      slot?: WorkflowSlot
      promptContext?: SubAgentPromptContext
    }) => {
      const startTime = Date.now()

      let session: AgentSession
      if (runOptions.sessionMode === 'sticky' && runOptions.sessionId) {
        const existing = this.getSession(runOptions.sessionId)
        if (existing) {
          session = existing
        } else {
          session = await this.createSession({
            id: runOptions.sessionId,
            agentName: runOptions.agentName,
            slot: runOptions.slot,
            promptContext: runOptions.promptContext,
          })
        }
      } else {
        session = await this.createSession({
          agentName: runOptions.agentName,
          slot: runOptions.slot,
          promptContext: runOptions.promptContext,
        })
      }

      await session.prompt(runOptions.prompt)
      const text = getLastAssistantText(session.session.messages())

      if (runOptions.sessionMode === 'ephemeral') {
        await this.removeSession(session.id)
      }

      return {
        text,
        sessionId: session.id,
        durationMs: Date.now() - startTime,
      }
    }

    return new Orchestrator({
      hookRegistry: this.hookRegistry,
      runSession: run,
    })
  }

  private initToolRegistry(options: VitaminAppOptions): ToolRegistry {
    const skillProvider = options.skillProvider

    const loadSkill: LoadSkill = skillProvider
      ? (path) => skillProvider.load(path)
      : async () => ({
          success: false,
          error: 'Skill provider not configured. Pass skillProvider to createVitamin().',
        })

    const executeSkill: ExecuteSkill = skillProvider
      ? (name, input, parameters) => skillProvider.execute(name, input, parameters)
      : async () => ({
          success: false,
          error: 'Skill provider not configured. Pass skillProvider to createVitamin().',
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
          this.listSessions().map((s) => ({
            id: s.id,
            title: s.id,
            messageCount: s.messageCount,
          })),
        create: async () => {
          const s = await this.createSession()
          return { id: s.id }
        },
        remove: async (id: string) => this.removeSession(id),
        compact: async (id: string) => {
          const s = this.getSession(id)
          if (!s) {
            return false
          }
          await s.compact('Compacted by session_manager tool', 1)
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

  private initPermissions(): {
    permissionRegistry: PermissionPolicyRegistry
    auditLog: PermissionAuditLog
  } {
    const permissionToolSets = createPermissionToolSetsFromRegistry(this.toolRegistry.getAll())
    const auditLog = new PermissionAuditLog()
    const permissionRegistry = createPermissionRegistry({
      toolSets: permissionToolSets,
    })
    this.hookRegistry.register(createPermissionGuardHook(permissionRegistry, auditLog))
    return { permissionRegistry, auditLog }
  }

  private registerHooks(): void {
    this.hookRegistry.register(
      createToolGuidanceHook(this.toolRegistry, () => this.defaultToolPreset),
    )
    this.hookRegistry.register(createEnvironmentInjectionHook(this.workspaceDir))
    this.hookRegistry.register(createLessonInjectionHook(this.learningStore, this.promptManager))
    this.hookRegistry.registerAll(createPhaseTrackingHooks())
    this.hookRegistry.registerAll(
      createSessionLearningHooks((id) => this.getSession(id), this.promptManager),
    )
  }

  private updatePermissionPolicies(setting: {
    permission_mode?: PermissionMode
    permissions?: PermissionPolicySetting[]
    disabled_tools?: string[]
  }): void {
    const toolSets = createPermissionToolSetsFromRegistry(this.toolRegistry.getAll())

    this.syncModePolicy(setting.permission_mode, toolSets)
    this.syncDisabledToolsPolicy(setting.disabled_tools)
    this.syncUserPolicies(setting.permissions)

    this.logger.debug(
      'Permission policies synced: %d policies active',
      this.permissionRegistry.getAll().length,
    )
  }

  private syncModePolicy(
    mode: PermissionMode | undefined,
    toolSets: ReturnType<typeof createPermissionToolSetsFromRegistry>,
  ): void {
    if (!mode || mode === this.currentPermissionMode) {
      return
    }

    this.permissionRegistry.unregister(`mode::${this.currentPermissionMode}`)
    this.permissionRegistry.register(createPermissionModePolicy(mode, toolSets))
    this.currentPermissionMode = mode
  }

  private syncDisabledToolsPolicy(disabledTools: string[] | undefined): void {
    if (disabledTools && disabledTools.length > 0) {
      this.permissionRegistry.register(createDisabledToolsPolicy(disabledTools))
    } else {
      this.permissionRegistry.unregister('setting::disabled-tools')
    }
  }

  private syncUserPolicies(permissions: PermissionPolicySetting[] | undefined): void {
    for (const p of this.permissionRegistry.getAll()) {
      if (p.name.startsWith('user::')) {
        this.permissionRegistry.unregister(p.name)
      }
    }

    if (!permissions) {
      return
    }

    for (const pc of permissions) {
      this.permissionRegistry.register(
        compilePolicyFromSetting({ ...pc, name: `user::${pc.name}` }),
      )
    }
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

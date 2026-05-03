import { Devtools } from '@x-mars/devtools'
import { createModelSlot, createDefaultProviderRegistry, ModelRegistry } from '@x-mars/ai'
import { createToolExecutor } from '@x-mars/agent'
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
  createToolOutputPersistenceHook,
  createCommandHook,
  isCommandHookConfig,
} from '@x-mars/hooks'
import type { CommandHookConfig, PermissionMode, PermissionPolicySetting } from '@x-mars/hooks'
import {
  createToolRegistry,
  createPluginManager,
  createPluginAgentRegistry,
  createPluginCommandRegistry,
  type PluginAgentRegistry,
  type PluginCommandRegistry,
  ToolRegistry,
  type ExecuteSkill,
  type LoadSkill,
  type SearchSkills,
  type CreateSkill,
  type ImproveSkill,
  type McpManager,
  type PluginManager,
  type PluginStateStore,
  type ListAgents,
  type CancelAgent,
  type SearchSessions,
  type ProgrammaticToolInvoker,
  type SchedulerControl,
  type SchedulerJobView,
} from '@x-mars/tools'
import { SESSION_MAX } from '@x-mars/env'
import { createResourceManager, SettingsManager } from '@x-mars/resources'
import { Orchestrator } from '@x-mars/orchestrator'
import type { RunSessionOptions, RunSessionResult } from '@x-mars/orchestrator'
import { Scheduler, createFileSchedulerJobStore } from '@x-mars/scheduler'
import type { SchedulerJob } from '@x-mars/scheduler'
import { FileStateManager, OperationalLearningStore } from '@x-mars/memory'
import type { SkillProvider } from '@x-mars/skill'

import {
  attachLogListener,
  createLogger,
  registerPluginLogContribution,
  unregisterPluginLogContribution,
  type Logger,
} from '@x-mars/shared'
import { AgentSession } from '../session/agent-session'
import { getLastAssistantText } from '../modes/run-modes'
import {
  CodingSessionManager,
  createDiskCodingSessionManager,
  createInMemoryCodingSessionManager,
  createRemoteCodingSessionManager,
} from '../session/coding-session-manager'
import { createToolHookExecutor } from '../session/hooks'
import {
  createToolGuidanceHook,
  createSkillCatalogHook,
  createMcpContextHook,
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
} from '@x-mars/prompt'
import type { AgentProfile } from '@x-mars/prompt'
import { BUILTIN_AGENT_PROFILES } from '@x-mars/setting'
import type { CommandHookSetting } from '@x-mars/setting'

import type { AgentTool } from '@x-mars/agent'
import type { AuthStore, Model, ProviderRegistry, WorkflowSlot } from '@x-mars/ai'
import type { HookRegistry } from '@x-mars/hooks'
import type { AgentSessionInfo, AgentSessionOptions, ResolvedSessionConfig } from '../session/types'

import type { XMarsAppOptions, XMarsContext } from '../types'
import type { ResourceManager } from '@x-mars/resources'
export { type XMarsAppOptions, type XMarsContext } from '../types'

function filterToolsByNames(tools: AgentTool[], names: string[]): AgentTool[] {
  const nameSet = new Set(names)
  return tools.filter((tool) => nameSet.has(tool.name))
}

function applyToolBoundary(
  tools: AgentTool[],
  policy: NonNullable<RunSessionOptions['sidechain']>['policy'] | undefined,
): AgentTool[] {
  if (!policy || policy.permissionMode !== 'restricted') {
    return tools
  }

  let scoped = tools
  if (policy.allowedTools?.length) {
    const allowed = new Set(policy.allowedTools)
    scoped = scoped.filter((tool) => allowed.has(tool.name))
  }
  if (policy.deniedTools?.length) {
    const denied = new Set(policy.deniedTools)
    scoped = scoped.filter((tool) => !denied.has(tool.name))
  }
  return scoped
}

function createSidechainPermissionMetadata(
  sidechain: RunSessionOptions['sidechain'] | undefined,
): Record<string, unknown> | undefined {
  if (!sidechain) {
    return undefined
  }

  return {
    sidechain: {
      taskId: sidechain.taskId,
      parentTaskId: sidechain.parentTaskId,
      parentSessionId: sidechain.parentSessionId,
      subagent: sidechain.subagent,
      category: sidechain.category,
      policy: {
        ...sidechain.policy,
        allowedTools: sidechain.policy.allowedTools
          ? [...sidechain.policy.allowedTools]
          : undefined,
        deniedTools: sidechain.policy.deniedTools ? [...sidechain.policy.deniedTools] : undefined,
      },
    },
  }
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

export class XMarsApp implements XMarsContext {
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
  public readonly mcpManager: McpManager | undefined
  public readonly pluginManager: PluginManager | undefined
  public readonly pluginCommandRegistry: PluginCommandRegistry
  public readonly pluginAgentRegistry: PluginAgentRegistry
  public readonly scheduler: Scheduler

  private readonly fileStateManager: FileStateManager
  private readonly learningStore: OperationalLearningStore
  private readonly promptManager: PromptManager
  private readonly defaultModel?: Model
  private readonly skillProvider?: SkillProvider
  private readonly pluginStateStore?: PluginStateStore

  private readonly orchestrator: Orchestrator
  private readonly defaultMaxActiveTasks?: number

  private disposed = false
  private settingsLoaded = false
  private defaultToolPreset: 'minimal' | 'standard' | 'full' = 'full'
  private currentPermissionMode: PermissionMode = 'auto'
  private readonly settingCommandHookNames = new Set<string>()
  private readonly settingDisabledHookNames = new Set<string>()

  public get tools(): AgentTool[] {
    return this.toolRegistry.getAvailable(this.defaultToolPreset).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      readonly: tool.readonly,
      shouldDefer: tool.shouldDefer ?? tool.metadata.shouldDefer,
      visibility: tool.metadata.builtin ? 'always' : 'when-enabled',
      execute: tool.execute,
      isReadOnly: tool.isReadOnly,
      isConcurrencySafe: tool.isConcurrencySafe,
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

  constructor(options: XMarsAppOptions) {
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
    this.mcpManager = options.mcpManager
    this.skillProvider = options.skillProvider
    this.pluginStateStore = options.pluginStateStore

    this.maxSessions = maxSessions ?? SESSION_MAX
    this.maxToolTurns = maxToolTurns ?? 10
    this.defaultMaxActiveTasks = options.maxActiveTasks
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

      this.syncDisabledHooks(setting.disabled_hooks)
      this.syncCommandHooks(setting.command_hooks, setting.disabled_hooks)
      this.updatePermissionPolicies(setting)
    })

    this.resourceManager =
      resourceManager ??
      createResourceManager({
        workspaceDir: this.workspaceDir,
      })

    this.fileStateManager = new FileStateManager()
    this.learningStore = new OperationalLearningStore({
      path: `${this.workspaceDir}/.x-mars/lessons.json`,
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
    this.scheduler = this.initScheduler()
    this.toolRegistry = this.initToolRegistry(options)
    this.pluginCommandRegistry = createPluginCommandRegistry()
    this.pluginAgentRegistry = createPluginAgentRegistry()
    this.pluginManager = options.pluginRoots?.length
      ? createPluginManager({
          roots: options.pluginRoots,
          toolRegistry: this.toolRegistry,
          hookRegistry: this.hookRegistry,
          lifecycleAdapters: {
            loadSkill: this.skillProvider
              ? async (skill) => {
                  const loaded = await this.skillProvider?.load(skill.path)
                  if (!loaded?.success) {
                    throw new Error(loaded?.error ?? `Failed to load skill "${skill.name}"`)
                  }
                }
              : undefined,
            unloadSkill: this.skillProvider?.unload
              ? async (skill) => {
                  const unloaded = await this.skillProvider?.unload?.(skill.name)
                  if (!unloaded?.success) {
                    throw new Error(unloaded?.error ?? `Failed to unload skill "${skill.name}"`)
                  }
                }
              : undefined,
            connectMcpServer: this.mcpManager
              ? async (name, config, pluginId) => {
                  await this.mcpManager?.connect(getPluginMcpServerName(pluginId, name), config)
                }
              : undefined,
            disconnectMcpServer: this.mcpManager
              ? async (name, pluginId) => {
                  await this.mcpManager?.disconnect(getPluginMcpServerName(pluginId, name))
                }
              : undefined,
            registerCommand: async (command, pluginId, handler) => {
              this.pluginCommandRegistry.register(command, pluginId, handler)
            },
            unregisterCommand: async (command, pluginId) => {
              this.pluginCommandRegistry.unregister(command.name, pluginId)
            },
            registerAgent: async (agent, pluginId) => {
              this.pluginAgentRegistry.register(agent, pluginId)
            },
            unregisterAgent: async (agent, pluginId) => {
              this.pluginAgentRegistry.unregister(agent.name, pluginId)
            },
            registerDevtools: this.devtools
              ? async (contribution, pluginId) => {
                  this.devtools?.registerPluginContribution(contribution, pluginId)
                }
              : undefined,
            unregisterDevtools: this.devtools
              ? async (pluginId) => {
                  this.devtools?.unregisterPluginContribution(pluginId)
                }
              : undefined,
            registerLogs: async (contribution, pluginId) => {
              registerPluginLogContribution(contribution, pluginId)
            },
            unregisterLogs: async (pluginId) => {
              unregisterPluginLogContribution(pluginId)
            },
          },
          trustedPluginIds: options.trustedPluginIds,
          disabledPluginIds: options.disabledPluginIds,
        })
      : undefined
    const { permissionRegistry, auditLog } = this.initPermissions()
    this.permissionRegistry = permissionRegistry
    this.auditLog = auditLog

    this.registerHooks()
    this.setupMcpSkillSync()
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
      'No model configured. Set model in .x-mars/config.jsonc or pass modelId to createXMars().',
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

    if (this.pluginManager) {
      if (this.pluginStateStore) {
        this.pluginManager.applyState(await this.pluginStateStore.load())
      }
      const diagnostics = await this.pluginManager.loadAll()
      if (diagnostics.errors.length > 0) {
        this.logger.warn(
          'Plugin loading completed with %d error(s): %s',
          diagnostics.errors.length,
          diagnostics.errors.join('; '),
        )
      }
      this.updatePermissionPolicies(this.settings.snapshot)
    }

    this.logger.info('XMarsApp started')
  }

  async stop(): Promise<void> {
    if (this.disposed) {
      return
    }

    this.settings.dispose()
    if (this.pluginManager) {
      await this.pluginManager.unloadAll()
    }
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
    this.logger.info('X-Mars app stopped')
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
   *   maxToolTurns: options.maxToolTurns > agentConfig > agentProfile > XMarsApp.maxToolTurns
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
          return this.promptManager.assemblePresetSections({
            preset: 'subagent',
            agentName: options.agentName,
            profile: agent.profile,
            context: options.promptContext,
          })
        }

        return this.promptManager.assemblePresetSections({ preset: 'main' })
      })

    const initialPrompt = options.systemPrompt ?? agent.systemPrompt ?? (await promptRefresh())
    const initialSystemPrompt =
      initialPrompt && typeof initialPrompt === 'object' && 'systemPrompt' in initialPrompt
        ? initialPrompt.systemPrompt
        : initialPrompt

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
      permissionMetadata: options.permissionMetadata,
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

  async forkSession(
    sourceId: string,
    newId?: string,
    overrides?: Partial<
      Pick<ResolvedSessionConfig, 'agentName' | 'tools' | 'workspaceDir' | 'permissionMetadata'>
    >,
  ): Promise<AgentSession | undefined> {
    return this.codingSessionManager.forkSession(sourceId, newId, overrides)
  }

  // ── Private init methods ─────────────────────────────────────────────────

  /**
   * SessionManager: configProvider 仅供 restore 路径使用，
   * 正常 createSession 走 resolveSessionConfig 完整解析。
   */
  private initSessionManager(
    options: XMarsAppOptions,
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
          promptRefresh: () => this.promptManager.assemblePresetSections({ preset: 'main' }),
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
            'Pass them in XMarsAppOptions.',
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
    const run = async (runOptions: RunSessionOptions): Promise<RunSessionResult> => {
      const startTime = Date.now()
      const sidechain = runOptions.sidechain
      const sidechainTools = applyToolBoundary(this.tools, sidechain?.policy)
      const sidechainWorkspace = sidechain?.policy.workspaceRoot
      const permissionMetadata = createSidechainPermissionMetadata(sidechain)
      const childSessionId =
        runOptions.sessionId ??
        (sidechain?.parentSessionId && sidechain.taskId
          ? `${sidechain.parentSessionId}::${sidechain.taskId}`
          : undefined)

      let session: AgentSession
      const stickySession =
        runOptions.sessionMode === 'sticky' && runOptions.sessionId
          ? this.getSession(runOptions.sessionId)
          : undefined
      if (runOptions.sessionMode === 'sticky' && runOptions.sessionId && stickySession) {
        session = stickySession
      } else if (sidechain?.parentSessionId) {
        const forked = await this.forkSession(sidechain.parentSessionId, childSessionId, {
          agentName: runOptions.agentName,
          tools: sidechainTools,
          workspaceDir: sidechainWorkspace,
          permissionMetadata,
        })
        session =
          forked ??
          (await this.createSession({
            id: childSessionId,
            agentName: runOptions.agentName,
            slot: runOptions.slot,
            promptContext: runOptions.promptContext,
            tools: sidechainTools,
            workspaceDir: sidechainWorkspace,
            permissionMetadata,
          }))
      } else if (runOptions.sessionMode === 'sticky' && runOptions.sessionId) {
        const existing = this.getSession(runOptions.sessionId)
        if (existing) {
          session = existing
        } else {
          session = await this.createSession({
            id: runOptions.sessionId,
            agentName: runOptions.agentName,
            slot: runOptions.slot,
            promptContext: runOptions.promptContext,
            tools: sidechainTools,
            workspaceDir: sidechainWorkspace,
            permissionMetadata,
          })
        }
      } else {
        session = await this.createSession({
          id: childSessionId,
          agentName: runOptions.agentName,
          slot: runOptions.slot,
          promptContext: runOptions.promptContext,
          tools: sidechainTools,
          workspaceDir: sidechainWorkspace,
          permissionMetadata,
        })
      }

      const resultSessionId = session.id
      try {
        await session.prompt(runOptions.prompt, { signal: runOptions.signal })
        const text = getLastAssistantText(session.session.messages())
        const transcript = sidechain ? [...session.session.messages()] : undefined
        const summary = sidechain ? text : undefined

        return {
          text,
          sessionId: resultSessionId,
          durationMs: Date.now() - startTime,
          summary,
          transcript,
        }
      } catch (error) {
        if (sidechain && error instanceof Error) {
          Object.assign(error, {
            sidechainSessionId: resultSessionId,
            sidechainTranscript: [...session.session.messages()],
          })
        }
        throw error
      } finally {
        if (runOptions.sessionMode === 'ephemeral') {
          await this.removeSession(resultSessionId)
        }
      }
    }

    return new Orchestrator({
      hookRegistry: this.hookRegistry,
      runSession: run,
      maxActiveTasks: () => this.resolveMaxActiveTasks(),
    })
  }

  private resolveMaxActiveTasks(): number {
    const workflow = this.settings.get('workflow')
    const value =
      typeof workflow?.max_active_tasks === 'number'
        ? workflow.max_active_tasks
        : typeof workflow?.maxActiveTasks === 'number'
          ? workflow.maxActiveTasks
          : this.defaultMaxActiveTasks

    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 10
  }

  private initScheduler(): Scheduler {
    return new Scheduler({
      store: createFileSchedulerJobStore(`${this.workspaceDir}/.x-mars/scheduler-jobs.json`),
      dispatchTask: async (input) => {
        const result = await this.orchestrator.dispatchTask({
          prompt: input.prompt,
          subagent: input.subagent,
          category: input.category,
          parentSessionId: input.parentSessionId,
          mode: 'background',
        })

        return {
          success: result.success,
          id: result.id,
          status: result.status,
          output: result.output,
          error: result.error,
        }
      },
    })
  }

  private createSchedulerControl(): SchedulerControl {
    const toView = (job: SchedulerJob): SchedulerJobView => ({
      id: job.id,
      prompt: job.prompt,
      schedule: job.schedule.expression,
      status: job.status,
      nextRunAt: job.nextRunAt,
      lastRunAt: job.lastRunAt,
      lastTaskId: job.lastTaskId,
      lastRunStatus: job.lastRunStatus,
      lastError: job.lastError,
      parentSessionId: job.parentSessionId,
      runCount: job.runCount,
      failureCount: job.failureCount,
    })

    return {
      create: async (input) => toView(await this.scheduler.createJob(input)),
      list: async () => (await this.scheduler.listJobs()).map(toView),
      pause: async (id) => {
        const job = await this.scheduler.pauseJob(id)
        return job ? toView(job) : undefined
      },
      resume: async (id) => {
        const job = await this.scheduler.resumeJob(id)
        return job ? toView(job) : undefined
      },
      trigger: async (id) => await this.scheduler.triggerJob(id),
      tick: async (input) => await this.scheduler.tick(input),
    }
  }

  private initToolRegistry(options: XMarsAppOptions): ToolRegistry {
    const skillProvider = options.skillProvider

    const loadSkill: LoadSkill = skillProvider
      ? (path) => skillProvider.load(path)
      : async () => ({
          success: false,
          error: 'Skill provider not configured. Pass skillProvider to createXMars().',
        })

    const executeSkill: ExecuteSkill = skillProvider
      ? (name, input, parameters) => skillProvider.execute(name, input, parameters)
      : async () => ({
          success: false,
          error: 'Skill provider not configured. Pass skillProvider to createXMars().',
        })
    const searchSkills: SearchSkills | undefined = skillProvider?.search
      ? (query, searchOptions) =>
          skillProvider.search?.(query, searchOptions) ?? Promise.resolve([])
      : undefined
    const viewSkill = skillProvider?.view
      ? (input: Parameters<NonNullable<SkillProvider['view']>>[0]) =>
          skillProvider.view?.(input) ??
          Promise.resolve({ success: false, error: 'Skill view is not configured.' })
      : undefined
    const createSkill: CreateSkill | undefined = skillProvider?.create
      ? (input) => skillProvider.create?.(input) ?? Promise.resolve({ success: false })
      : undefined
    const improveSkill: ImproveSkill | undefined = skillProvider?.improve
      ? (input) => skillProvider.improve?.(input) ?? Promise.resolve({ success: false })
      : undefined
    const listAgents: ListAgents = async ({ includeDisabled } = {}) => {
      await this.ensureSettingsLoaded()
      const tasks = await this.orchestrator.taskStore.list()
      const runtimeByAgent = new Map<
        string,
        {
          activeTaskCount: number
          runningTaskIds: string[]
          recentTaskIds: string[]
          lastTaskStatus?: string
        }
      >()
      for (const task of tasks) {
        const name = task.input.subagent
        if (!name) {
          continue
        }
        const runtime = runtimeByAgent.get(name) ?? {
          activeTaskCount: 0,
          runningTaskIds: [],
          recentTaskIds: [],
        }
        if (task.status === 'running' || task.status === 'pending') {
          runtime.activeTaskCount++
        }
        if (task.status === 'running') {
          runtime.runningTaskIds.push(task.id)
        }
        runtime.recentTaskIds.push(task.id)
        runtime.lastTaskStatus = task.status
        runtimeByAgent.set(name, runtime)
      }

      const agents = new Map<
        string,
        {
          name: string
          description?: string
          source?: 'builtin' | 'file' | 'settings' | 'plugin' | 'unknown'
          filePath?: string
          tools?: string[]
          capabilities?: string[]
          categories?: string[]
          defaultWorkflowSlot?: string
          maxToolTurns?: number
          disabled?: boolean
          activeTaskCount?: number
          runningTaskIds?: string[]
          recentTaskIds?: string[]
          lastTaskStatus?: string
        }
      >()

      for (const profile of BUILTIN_AGENT_PROFILES) {
        const runtime = runtimeByAgent.get(profile.name)
        agents.set(profile.name, {
          name: profile.name,
          description: profile.taskTypes.join(', '),
          source: 'builtin',
          tools: resolveAgentToolNames(profile.defaultTools),
          capabilities: profile.capabilities,
          categories: profile.taskTypes,
          maxToolTurns: profile.defaultMaxToolTurns,
          ...runtime,
        })
      }

      for (const [name, agent] of Object.entries(this.settings.get('agents') ?? {})) {
        const filePath = typeof agent.filePath === 'string' ? agent.filePath : undefined
        const runtime = runtimeByAgent.get(name)
        agents.set(name, {
          name,
          description: agent.description,
          source: filePath ? 'file' : 'settings',
          filePath,
          tools: agent.tools,
          capabilities: agent.capabilities,
          categories: agent.categories,
          defaultWorkflowSlot: agent.default_workflow_slot,
          maxToolTurns: agent.max_tool_turns,
          disabled: agent.disabled,
          ...runtime,
        })
      }

      for (const { pluginId, agent } of this.pluginAgentRegistry.list()) {
        const runtime = runtimeByAgent.get(agent.name)
        agents.set(agent.name, {
          name: agent.name,
          description: agent.description,
          source: 'plugin',
          tools: agent.tools,
          categories: [`plugin:${pluginId}`],
          ...runtime,
        })
      }

      return {
        success: true,
        agents: [...agents.values()].filter((agent) => includeDisabled || !agent.disabled),
      }
    }
    const cancelAgent: CancelAgent = async (agent, { includePending } = {}) => {
      const tasks = await this.orchestrator.taskStore.list()
      const cancelled: string[] = []
      const skipped: Array<{ id: string; status: string; reason: string }> = []

      for (const task of tasks) {
        if (task.input.subagent !== agent) {
          continue
        }
        if (task.status !== 'running' && !(includePending && task.status === 'pending')) {
          skipped.push({
            id: task.id,
            status: task.status,
            reason: includePending ? 'not active' : 'not running',
          })
          continue
        }

        const result = await this.orchestrator.updateTask(task.id, 'cancel')
        if (result.success) {
          cancelled.push(task.id)
        } else {
          skipped.push({
            id: task.id,
            status: task.status,
            reason: result.message,
          })
        }
      }

      return {
        success: true,
        agent,
        cancelled,
        skipped,
      }
    }
    const searchSessions: SearchSessions = (input) =>
      this.codingSessionManager.searchSessions(input)
    const invokeProgrammaticTool: ProgrammaticToolInvoker = async ({ name, params, signal }) => {
      if (name === 'execute_code') {
        return {
          content: [{ type: 'text', text: 'execute_code cannot call itself' }],
          isError: true,
        }
      }

      const tool = this.toolRegistry.get(name)
      if (!tool) {
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        }
      }

      const executor = createToolExecutor([tool], {
        hookExecutor: createToolHookExecutor({
          hookRegistry: this.hookRegistry,
          agentName: 'execute_code',
          sessionId: 'programmatic',
          metadata: { source: 'execute_code' },
        }),
        agentName: 'execute_code',
        sessionId: 'programmatic',
      })

      return executor.execute(
        {
          type: 'tool_call',
          id: `execute_code:${name}:${Date.now()}`,
          name,
          arguments: params,
        },
        signal ?? new AbortController().signal,
      )
    }

    const registry = createToolRegistry(this.workspaceDir, {
      callAgent: this.orchestrator.callAgent,
      loadSkill,
      executeSkill,
      searchSkills,
      viewSkill,
      createSkill,
      improveSkill,
      listAgents,
      cancelAgent,
      searchSessions,
      invokeProgrammaticTool,
      webFetchProvider: options.webFetchProvider,
      webSearchProvider: options.webSearchProvider,
      scheduler: this.createSchedulerControl(),
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
      mcpManager: this.mcpManager,
    })

    return registry
  }

  private initPermissions(): {
    permissionRegistry: PermissionPolicyRegistry
    auditLog: PermissionAuditLog
  } {
    const permissionToolSets = createPermissionToolSetsFromRegistry(this.toolRegistry.getAll())
    const auditLog = new PermissionAuditLog()
    auditLog.onRecord((entry) => {
      this.devtools?.auditTrace.recordPermissionDecision(
        entry as unknown as Record<string, unknown>,
        entry.sessionId,
      )
    })
    const permissionRegistry = createPermissionRegistry({
      toolSets: permissionToolSets,
    })
    this.hookRegistry.register(createPermissionGuardHook(permissionRegistry, auditLog))
    return { permissionRegistry, auditLog }
  }

  private registerHooks(): void {
    this.hookRegistry.register(
      createToolOutputPersistenceHook({
        baseDir: `${this.workspaceDir}/.x-mars/tool-outputs`,
      }),
    )
    this.hookRegistry.register(
      createToolGuidanceHook(this.toolRegistry, () => this.defaultToolPreset),
    )
    if (this.mcpManager) {
      this.hookRegistry.register(createMcpContextHook(this.mcpManager))
    }
    if (this.skillProvider?.catalog) {
      this.hookRegistry.register(createSkillCatalogHook(this.skillProvider))
    }
    this.hookRegistry.register(createEnvironmentInjectionHook(this.workspaceDir))
    this.hookRegistry.register(createLessonInjectionHook(this.learningStore, this.promptManager))
    this.hookRegistry.registerAll(createPhaseTrackingHooks())
    this.hookRegistry.registerAll(
      createSessionLearningHooks((id) => this.getSession(id), this.promptManager),
    )
  }

  private setupMcpSkillSync(): void {
    if (!this.mcpManager || !this.skillProvider?.syncMcpSkills) {
      return
    }

    const sync = (reason: string): void => {
      void this.skillProvider
        ?.syncMcpSkills?.(this.mcpManager!)
        .then((result) => {
          if (result.synced > 0 || result.errors.length > 0) {
            this.logger.info(
              'MCP skill sync completed after %s: synced=%d skipped=%d errors=%d',
              reason,
              result.synced,
              result.skipped,
              result.errors.length,
            )
          }
        })
        .catch((error) => {
          this.logger.warn(
            'MCP skill sync failed after %s: %s',
            reason,
            error instanceof Error ? error.message : String(error),
          )
        })
    }

    this.mcpManager.on('server.connected', () => sync('server.connected'))
    this.mcpManager.on('resources.changed', () => sync('resources.changed'))
    sync('initialization')
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

  private syncDisabledHooks(disabledHooks: string[] | undefined): void {
    const next = new Set(disabledHooks ?? [])

    for (const name of this.settingDisabledHookNames) {
      if (!next.has(name)) {
        this.hookRegistry.enable(name)
      }
    }

    for (const name of next) {
      this.hookRegistry.disable(name)
    }

    this.settingDisabledHookNames.clear()
    for (const name of next) {
      this.settingDisabledHookNames.add(name)
    }
  }

  private syncCommandHooks(
    commandHooks: CommandHookSetting[] | undefined,
    disabledHooks: string[] | undefined,
  ): void {
    for (const name of this.settingCommandHookNames) {
      this.hookRegistry.unregister(name)
    }
    this.settingCommandHookNames.clear()

    const disabled = new Set(disabledHooks ?? [])

    for (const hook of commandHooks ?? []) {
      if (!isCommandHookConfig(hook) || hook.enabled === false) {
        continue
      }

      const runtimeName = `setting::command-hook::${hook.name}`
      const enabled = !disabled.has(hook.name) && !disabled.has(runtimeName)
      const config: CommandHookConfig = {
        ...hook,
        name: runtimeName,
        enabled,
      }

      this.hookRegistry.register(createCommandHook(config))
      this.settingCommandHookNames.add(runtimeName)
    }
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
      throw new Error('XMarsApp has been stopped and cannot be reused.')
    }
  }
}

export function createXMars(options: XMarsAppOptions): XMarsApp {
  return new XMarsApp(options)
}

function getPluginMcpServerName(pluginId: string, name: string): string {
  return `${pluginId}:${name}`
}

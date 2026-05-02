import type { SkillProvider } from '@x-mars/skill'
import type { AgentTool } from '@x-mars/agent'
import type { AuthStore, Model, ProviderRegistry } from '@x-mars/ai'
import type { ModelRegistry } from '@x-mars/ai'
import type { HookRegistry, PermissionPolicyRegistry, PermissionAuditLog } from '@x-mars/hooks'
import type {
  ToolRegistry,
  PluginManager,
  PluginStateStore,
  PluginCommandRegistry,
  PluginAgentRegistry,
} from '@x-mars/tools'
import type { McpManager } from '@x-mars/tools'
import type { PromptProviderOptions } from '@x-mars/prompt'
import type { ResourceManager } from '@x-mars/resources'
import type { SettingsManager } from '@x-mars/resources'
import type { CodingSessionManager } from './session/coding-session-manager'
import type { AgentSessionInfo, AgentSessionOptions, ResolvedSessionConfig } from './session/types'
import type { AgentSession } from './session/agent-session'
import type { Logger, LogLevel } from '@x-mars/shared'
import type { Devtools } from '@x-mars/devtools'

export interface XMarsContext {
  readonly workspaceDir: string
  readonly tools: AgentTool[]

  readonly settings: SettingsManager
  readonly resourceManager: ResourceManager
  readonly modelRegistry: ModelRegistry
  readonly providerRegistry: ProviderRegistry
  readonly hookRegistry: HookRegistry
  readonly permissionRegistry: PermissionPolicyRegistry
  readonly auditLog: PermissionAuditLog
  readonly toolRegistry: ToolRegistry
  readonly pluginManager: PluginManager | undefined
  readonly pluginCommandRegistry: PluginCommandRegistry
  readonly pluginAgentRegistry: PluginAgentRegistry
  readonly mcpManager: McpManager | undefined
  readonly sessionManager: CodingSessionManager
  readonly authStore: AuthStore
  readonly logger: Logger
  readonly devtools: Devtools | null

  start(): Promise<void>
  stop(): Promise<void>
  createSession(options?: Partial<AgentSessionOptions>): Promise<AgentSession>
  getSession(id: string): AgentSession | undefined
  getActiveSession(): AgentSession | undefined
  listSessions(): AgentSessionInfo[]
  removeSession(id: string): Promise<boolean>
  forkSession(
    sourceId: string,
    newId?: string,
    overrides?: Partial<
      Pick<ResolvedSessionConfig, 'agentName' | 'tools' | 'workspaceDir' | 'permissionMetadata'>
    >,
  ): Promise<AgentSession | undefined>
}

export interface XMarsAppOptions {
  port: number
  inspect: boolean
  logger: {
    name: string
    level: LogLevel
    destination: string
  }

  model?: Model
  modelId?: string
  modelRegistry?: ModelRegistry
  authStore?: AuthStore
  providerRegistry?: ProviderRegistry
  hookRegistry?: HookRegistry
  workspaceDir?: string
  projectConfigPath?: string
  sessionDir?: string
  sessionUrl?: string
  maxSessions?: number
  maxToolTurns?: number
  resourceManager?: ResourceManager
  /** prompt 提供者配置，默认使用内置 prompts 目录 */
  prompt?: PromptProviderOptions
  /**
   * skill 实现注入点（可选）。
   * 未提供时 skill_load / skill_execute 工具仍注册，但返回"功能未配置"提示。
   * 未来可注入基于 @x-mars/skill 的完整实现。
   */
  skillProvider?: SkillProvider
  /** 可选 MCP manager。提供后注册 MCP resource/prompt 工具并注入 MCP prompt section。 */
  mcpManager?: McpManager
  /** 本地插件根目录。启动时扫描并加载其中的 plugin.json / x-mars-plugin.json。 */
  pluginRoots?: string[]
  /**
   * 插件状态存储。提供后 App start 会加载 trusted/disabled 状态。
   */
  pluginStateStore?: PluginStateStore
  /**
   * 已信任插件 ID。运行时注入点，可与 pluginStateStore 合并使用。
   */
  trustedPluginIds?: string[]
  /**
   * 已禁用插件 ID。运行时注入点，可与 pluginStateStore 合并使用。
   */
  disabledPluginIds?: string[]
  /**
   * 使用远端 session 存储时必填（sessionUrl 指定时生效）。
   */
  sessionFetch?: typeof globalThis.fetch
  sessionGetAuth?: () => Promise<{ token: string }>
  sessionTimeoutMs?: number
}

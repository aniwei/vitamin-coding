import type { AgentTool } from '@vitamin/agent'
import type { AuthStore, Model, ProviderRegistry } from '@vitamin/ai'
import type { ModelRegistry } from '@vitamin/ai'
import type { HookRegistry, PermissionPolicyRegistry, PermissionAuditLog } from '@vitamin/hooks'
import type { ToolRegistry } from '@vitamin/tools'
import type { PromptProviderOptions } from '@vitamin/prompt'
import type { ResourceManager } from '@vitamin/resources'
import type { SettingsManager } from '@vitamin/resources'
import type { CodingSessionManager } from './session/coding-session-manager'
import type { AgentSessionInfo, AgentSessionOptions } from './session/types'
import type { AgentSession } from './session/agent-session'
import type { Logger } from '@vitamin/shared'
import type { Devtools } from '@vitamin/devtools'

export interface VitaminContext {
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
  forkSession(sourceId: string, newId?: string): Promise<AgentSession | undefined>
}

/**
 * SkillProvider — skill 功能的扩展接口。
 *
 * VitaminApp 当前不内置 skill 实现（入口预留），调用方可注入此接口。
 * 未注入时，skill_load / skill_execute 工具会返回"功能未配置"的错误提示。
 */
export interface SkillProvider {
  /** 从指定路径加载 SKILL.md 定义 */
  load(path: string): Promise<{ success: boolean; name?: string; error?: string }>
  /** 执行已加载的 skill */
  execute(name: string, input?: string, parameters?: Record<string, string>): Promise<{ success: boolean; output?: string; error?: string }>
}

export interface VitaminAppOptions {
  port: number
  inspect: boolean
  logger: {
    name: string
    level: 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'fatal'
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
   * 未来可注入基于 @vitamin/skill 的完整实现。
   */
  skillProvider?: SkillProvider
  /**
   * 使用远端 session 存储时必填（sessionUrl 指定时生效）。
   */
  sessionFetch?: typeof globalThis.fetch
  sessionGetAuth?: () => Promise<{ token: string }>
  sessionTimeoutMs?: number
}


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
  listSessions(): AgentSessionInfo[]
  removeSession(id: string): Promise<boolean>
  forkSession(sourceId: string, newId?: string): Promise<AgentSession | undefined>
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
  tools?: AgentTool[]
  authStore?: AuthStore
  providerRegistry?: ProviderRegistry
  systemPrompt?: string
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
}

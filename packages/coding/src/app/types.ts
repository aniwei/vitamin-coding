import type { AgentTool } from '@vitamin/agent'
import type { AuthStore, Model, ProviderRegistry } from '@vitamin/ai'
import type { ModelRegistry } from '@vitamin/ai'
import type { HookRegistry } from '@vitamin/hooks'
import type { Approver, RetryStrategy, ReviewGate } from '@vitamin/orchestrator'
import type { ToolRegistry } from '@vitamin/tools'
import type { Logger } from '@vitamin/shared'
import type { ResourceManager } from '../resources/resource-manager'
import type { PromptManager } from '../lead/prompt-manager'
import type { CodingSessionManager } from '../session/coding-session-manager'
import type { SettingsManager } from '../resources/settings-manager'


export interface VitaminContext {
  readonly logger: Logger
  readonly defaultTools: AgentTool[]
  readonly workspaceDir: string
  readonly settings: SettingsManager
  readonly modelRegistry: ModelRegistry
  readonly providerRegistry: ProviderRegistry
  readonly hookRegistry: HookRegistry
  readonly resourceManager: ResourceManager
  readonly promptManager: PromptManager
  readonly toolRegistry: ToolRegistry
  readonly codingSessionManager: CodingSessionManager
}

export interface VitaminAppOptions {
  port: number
  inspect: boolean
  workspaceDir?: string
  persistenceMode?: 'disk' | 'memory' | 'remote'
  sessionDir?: string
  sessionUrl?: string
  maxSessions: number

  // TODO
  idleTimeoutMs: number, 
  threshold: number,
  
  tools?: AgentTool[]
  model?: Model
  systemPrompt?: string
  maxToolTurns?: number
  maxConcurrentTasks?: number
  
  authStore?: AuthStore
  // 资源管理器
  resourceManager?: ResourceManager
  // 默认模型 ID（通过 ModelRegistry / ProviderRegistry 解析）
  modelRegistry?: ModelRegistry
  // Provider 注册表
  providerRegistry?: ProviderRegistry
  // 全局 Hook 注册表
  hookRegistry?: HookRegistry
  // Orchestrator 审批器（公开命名）
  approver?: Approver
  // 兼容旧命名
  reviewGate?: ReviewGate
  // Orchestrator 重试策略
  retryStrategy?: RetryStrategy
  logger: {
    name: string
    level: 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'fatal'
    destination: string
  }
}

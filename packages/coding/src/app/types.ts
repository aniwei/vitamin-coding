import type { AgentTool } from '@vitamin/agent'
import type { AuthStore, Model, ProviderRegistry } from '@vitamin/ai'
import type { ModelRegistry } from '@vitamin/ai'
import type { HookRegistry } from '@vitamin/hooks'
import type { Approver, RetryStrategy, ReviewGate } from '@vitamin/orchestrator'
import type { ResourceManager } from '../resources/resource-manager'
import type { PromptManager } from '../lead/prompt-manager'
import type { CodingSessionManager } from '../session/coding-session-manager'
import type { SettingsManager } from '../resources/settings-manager'
import type { ToolRegistry } from '@vitamin/tools'
import type { Logger } from '@vitamin/shared'


export interface VitaminRuntime {
  readonly logger: Logger
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
  // 工作目录
  workspaceDir?: string
  // 自定义会话持久化后端
  persistenceMode?: 'disk' | 'memory' | 'remote'
  // 会话持久化配置（根据 persistenceMode 选择性提供）
  sessionDir?: string
  // 远程会话持久化配置
  sessionUrl?: string
  // Clarify Handler：当用户输入不明确时触发，返回澄清问题供 UI 展示


  logger: {
    name: string
    level: 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'fatal'
    destination: string
  }
  // 工具集 
  tools?: AgentTool[]
  // 默认模型
  model?: Model
  // 默认模型 ID（通过 ModelRegistry / ProviderRegistry 解析）
  modelRegistry?: ModelRegistry
  // 凭据存储（AuthStore），未提供时自动创建默认实例
  authStore?: AuthStore
  // Provider 注册表
  providerRegistry?: ProviderRegistry
  // 默认系统提示词
  systemPrompt?: string
  // 全局 Hook 注册表
  hookRegistry?: HookRegistry
  
  // 最大并发会话数
  maxSessions?: number
  // 默认最大连续工具轮次
  maxToolTurns?: number
  // Orchestrator 审批器（公开命名）
  approver?: Approver
  // 兼容旧命名
  reviewGate?: ReviewGate
  // Orchestrator 重试策略
  retryStrategy?: RetryStrategy
}

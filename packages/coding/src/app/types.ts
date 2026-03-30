import type { SessionStore, SessionPersistence } from '@vitamin/session'
import type { AgentMessage, AgentTool } from '@vitamin/agent'
import type { AuthStore, Model, ProviderRegistry } from '@vitamin/ai'
import type { ModelRegistry } from '@vitamin/ai'
import type { HookRegistry } from '@vitamin/hooks'
import type { ConfigStore, VitaminConfig } from '@vitamin/config'
import type { ReviewGate, RetryStrategy, CircuitBreaker, CompositeRouter } from '@vitamin/orchestrator'
import type { ResourceManager, ResourceManagerOptions } from '../resources/resource-manager'
import type { PromptManager } from '../lead/prompt-manager'
import type { CodingSessionManager } from '../session/coding-session-manager'
import type { SettingsManager } from '../resources/settings-manager'
import type { ToolRegistry } from '@vitamin/tools'


export interface VitaminRuntime {
  readonly locale: boolean
  readonly workspaceDir: string
  readonly modelRegistry: ModelRegistry
  readonly providerRegistry: ProviderRegistry
  readonly hookRegistry: HookRegistry
  readonly settingsManager: SettingsManager
  readonly resourceManager: ResourceManager
  readonly promptManager: PromptManager
  readonly toolRegistry: ToolRegistry
  readonly toolsRegistry: ToolRegistry
  readonly sessionManager: CodingSessionManager
  readonly codingSessionManager: CodingSessionManager
  readonly defaultTools: AgentTool[] | undefined
}


export interface VitaminAppOptions {
  port: number
  inspect: boolean
  locale: boolean,
  
  logger: {
    name: string
    level: 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'fatal'
    destination: string
  }
  // 自定义 SessionStore 实现（默认 InMemorySessionStore）
  sessionStore?: SessionStore<AgentMessage>
  // 默认模型
  model?: Model
  // 默认模型 ID（通过 ModelRegistry / ProviderRegistry 解析）
  modelId?: string
  // 模型注册表（提供后支持字符串 → Model 解析）
  modelRegistry?: ModelRegistry
  // 默认工具集 
  tools?: AgentTool[]
  // 凭据存储（AuthStore），未提供时自动创建默认实例
  auth?: AuthStore
  // Provider 注册表
  providerRegistry?: ProviderRegistry
  // 默认系统提示词
  systemPrompt?: string
  // 全局 Hook 注册表
  hookRegistry?: HookRegistry
  // 工作目录
  workspaceDir?: string
  // 全局配置文件路径
  globalConfigPath?: string
  // 项目级配置文件路径
  projectConfigPath?: string
  // 配置覆盖（最高优先级）
  configOverrides?: Partial<VitaminConfig>
  // 配置持久化后端
  configStore?: ConfigStore
  // 是否监听配置文件变更
  watchConfig?: boolean
  // 会话存储目录（启用文件持久化）
  sessionDir?: string
  // 会话存储 API 端点（启用远程持久化）
  sessionUrl?: string
  // 自定义会话持久化后端
  sessionPersistence?: SessionPersistence<AgentMessage>
  // 最大并发会话数
  maxSessions?: number
  // 默认最大连续工具轮次
  maxToolTurns?: number
  // 资源管理器（AGENTS.md、Prompt 模板）
  resourceManager?: ResourceManager
  // 资源加载选项（当 resourceManager 未提供时使用）
  resourceOptions?: ResourceManagerOptions
  // 澄清请求处理器（提供后 clarifyRequest 工具可用）
  clarifyHandler?: (request: { question: string }) => Promise<{ answer: string }>
  // Orchestrator 质量门禁
  reviewGate?: ReviewGate
  // Orchestrator 重试策略
  retryStrategy?: RetryStrategy
  // Orchestrator 熔断器
  circuitBreaker?: CircuitBreaker
  // Orchestrator 路由器
  router?: CompositeRouter
}

import type { AgentMessage, AgentTool, StreamFunction } from '@x-mars/agent'
import type { Model, ProviderRegistry, ThinkingLevel, WorkflowSlot } from '@x-mars/ai'
import type { HookRegistry } from '@x-mars/hooks'
import type { PromptAssembly, PromptPreset, SubAgentPromptContext } from '@x-mars/prompt'
import type { Logger } from '@x-mars/shared'
import type { Devtools } from '@x-mars/devtools'
import type { SessionStore } from '@x-mars/session'

/**
 * 经过 XMarsApp 完整解析后的 session 配置。
 * 所有业务字段均已确定，无需再做 merge。
 * Manager 层只接受此类型来创建 session，不持有业务默认值。
 */
export interface ResolvedSessionConfig {
  model: Model
  agentName?: string
  systemPrompt: string
  tools: AgentTool[]
  thinkingLevel: ThinkingLevel
  maxToolTurns: number
  promptRefresh?: PromptRefresh
  workspaceDir: string
  permissionMetadata?: Record<string, unknown>
}

// Re-export event types from @x-mars/agent so downstream packages import from there,
// but coding-internal code (agent-session.ts etc.) can still import from this file.
export type {
  AgentSessionEvent,
  AgentSessionEventType,
  AgentSessionSubscriber,
  AskUserQuestion,
  PluginCommandDiagnostic,
} from '@x-mars/agent'

export interface AgentSessionOptions {
  id?: string
  model: Model
  agentName?: string
  promptPreset?: PromptPreset
  promptContext?: SubAgentPromptContext
  slot?: WorkflowSlot
  systemPrompt?: string
  tools?: AgentTool[]
  thinkingLevel?: ThinkingLevel
  maxToolTurns?: number
  workspaceDir?: string
  hookRegistry: HookRegistry
  stream: StreamFunction
  logger: Logger
  devtools?: Devtools
  promptRefresh?: PromptRefresh
  permissionMetadata?: Record<string, unknown>
}

// CreateAgentSessionOptions 是便捷函数接口，stream 由 providerRegistry 内部推导
// 调用方无需手动组装 StreamFunction
export interface CreateAgentSessionOptions extends Omit<AgentSessionOptions, 'stream'> {
  sessionStore?: SessionStore<AgentMessage>
  providerRegistry?: ProviderRegistry
  stream?: StreamFunction
}

export interface AgentSessionInfo {
  id: string
  messageCount: number
  createdAt: Date
  updatedAt?: Date
  model?: string
  status: string
}

export interface PromptOptions {
  images?: Array<{ type: 'image'; data: string; mediaType: string }>
  streamingBehavior?: 'steer' | 'followUp'
  signal?: AbortSignal
}

export interface ContextDiagnosticsSection {
  key: string
  layer: string
  cacheable: boolean
  source: string
  priority: number
  chars: number
  estimatedTokens: number
  fingerprint: string
}

export interface ContextDiagnosticsTool {
  name: string
  visibility?: AgentTool['visibility']
  readonly: boolean | 'dynamic'
  deferred: boolean
}

export interface ContextDiagnostics {
  sessionId: string
  model: string
  provider: string
  status: string
  messageCount: number
  prompt: {
    sectionCount: number
    totalChars: number
    estimatedTokens: number
    staticPrefixChars: number
    dynamicTailChars: number
    cacheableSectionCount: number
    dynamicSectionCount: number
    fingerprint?: string
    toolSchemaFingerprint?: string
    sections: ContextDiagnosticsSection[]
    content?: string
  }
  tools: {
    count: number
    deferredCount: number
    visibleCount: number
    items: ContextDiagnosticsTool[]
  }
  runtime: {
    workspaceDir: string
    agentName: string
    promptCacheAvailable: boolean
    promptContentIncluded: boolean
  }
}

export interface ContextDiagnosticsOptions {
  includePrompt?: boolean
}

export type PromptRefresh = () => Promise<string | PromptAssembly | undefined>

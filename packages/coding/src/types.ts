import type { createLogger } from '@vitamin/shared'
import type { loadConfig } from '@vitamin/config'
import type { AgentConfig, AgentEventListener, AgentTool } from '@vitamin/agent'
import type { Model, ProviderRegistry, ThinkingLevel } from '@vitamin/ai'
import type { Session } from '@vitamin/session'

// ═══ AgentSession 配置 ═══

export interface AgentSessionOptions {
  /** 会话 ID（可选，默认自动生成） */
  id?: string
  /** LLM 模型 */
  model?: Model
  /** 系统提示词 */
  systemPrompt?: string
  /** 工具列表 */
  tools?: AgentTool[]
  /** 思维级别 */
  thinkingLevel?: ThinkingLevel
  /** 工作目录 */
  cwd?: string
  /** Provider 注册表（用于自动构建 stream） */
  providerRegistry?: ProviderRegistry
  /** 自定义 Agent 配置覆盖 */
  agentConfig?: Partial<AgentConfig>
}

// ═══ AgentSession 事件 ═══

export type AgentSessionEventType =
  | 'session_start'
  | 'session_end'
  | 'session_switch'
  | 'prompt_start'
  | 'prompt_end'
  | 'message_persisted'
  | 'compaction_start'
  | 'compaction_end'
  | 'error'

export type AgentSessionEvent =
  | { type: 'session_start'; sessionId: string }
  | { type: 'session_end'; sessionId: string }
  | { type: 'session_switch'; fromId: string; toId: string }
  | { type: 'prompt_start'; sessionId: string; text: string }
  | { type: 'prompt_end'; sessionId: string }
  | { type: 'message_persisted'; sessionId: string; role: string }
  | { type: 'compaction_start'; sessionId: string }
  | { type: 'compaction_end'; sessionId: string }
  | { type: 'error'; sessionId: string; error: Error }

export type AgentSessionEventListener = (event: AgentSessionEvent) => void

// ═══ AgentSession 信息 ═══

export interface AgentSessionInfo {
  id: string
  messageCount: number
  createdAt: Date
  model?: string
  status: string
}


export interface SystemContext {
  logger: ReturnType<typeof createLogger>
  config: Awaited<ReturnType<typeof loadConfig>>

  createSession: (options?: AgentSessionOptions) => Promise<AgentSession>
  getSession: (id: string) => AgentSession | undefined
  listSessions: () => AgentSessionInfo[]
  removeSession: (id: string) => boolean
}

export interface AgentSession {
  readonly id: string
  readonly session: Session
  readonly status: string
  prompt(text: string, options?: PromptOptions): Promise<void>
  steer(text: string): void
  followUp(text: string): void
  onAgentEvent(listener: AgentEventListener): () => void
  onSessionEvent(listener: AgentSessionEventListener): () => void
  abort(): void
  dispose(): void
}


export interface PromptOptions {
  images?: Array<{ type: 'image'; data: string; mediaType: string }>
  streamingBehavior?: 'steer' | 'followUp'
}
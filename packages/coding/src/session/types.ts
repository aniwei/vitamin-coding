import type { AgentTool, ToolCallEvent } from '@vitamin/agent'
import type { Model, ProviderRegistry, ThinkingLevel } from '@vitamin/ai'
import type { HookRegistry } from '@vitamin/hooks'
import type { SessionStore } from '@vitamin/session'
import type { AgentMessage } from '@vitamin/agent'
import type { Logger } from '@vitamin/shared'

export interface AgentSessionOptions {
  id: string
  model: Model
  systemPrompt: string
  tools: AgentTool[]
  thinkingLevel: ThinkingLevel
  maxToolTurns: number
  workspaceDir: string
  providerRegistry: ProviderRegistry
  logger: Logger
  promptRefresh: () => string | undefined
}

export interface CreateAgentSessionOptions {
  model: Model
  systemPrompt: string
  tools: AgentTool[]
  thinkingLevel: ThinkingLevel
  maxToolTurns: number
  hookRegistry: HookRegistry
  providerRegistry: ProviderRegistry
  sessionStore?: SessionStore<AgentMessage>
  id: string
  workspaceDir: string
  logger: Logger
}

export type AgentSessionEventType = AgentSessionEvent['type']

export type AgentSessionEvent =
  // 会话生命周期
  | { type: 'session_start'; sessionId: string }
  | { type: 'session_end'; sessionId: string }
  // Prompt 生命周期
  | { type: 'prompt_start'; sessionId: string; text: string }
  | { type: 'prompt_end'; sessionId: string }
  // 消息持久化
  | { type: 'message_persisted'; sessionId: string; role: string }
  // Agent 状态变更
  | { type: 'agent_status'; sessionId: string; from: string; to: string }
  // 流式传输
  | { type: 'streaming_start'; sessionId: string; model: string }
  | { type: 'streaming_end'; sessionId: string; model: string; stopReason: string }
  // Turn 追踪
  | { type: 'turn_start'; sessionId: string; turnIndex: number }
  | { type: 'turn_end'; sessionId: string; turnIndex: number }
  // 工具调用
  | { type: 'tool_call_start'; sessionId: string; toolCall: ToolCallEvent }
  | { type: 'tool_call_end'; sessionId: string; toolCall: ToolCallEvent; isError: boolean }
  // 压缩
  | { type: 'compaction_start'; sessionId: string; messageCount: number }
  | { type: 'compaction_end'; sessionId: string; retainedCount: number }
  // 错误
  | { type: 'error'; sessionId: string; error: Error }

export type AgentSessionSubscriber = (event: AgentSessionEvent) => void

export interface AgentSessionInfo {
  id: string
  messageCount: number
  createdAt: Date
  model?: string
  status: string
}

export interface PromptOptions {
  images?: Array<{ type: 'image'; data: string; mediaType: string }>
  streamingBehavior?: 'steer' | 'followUp'
}
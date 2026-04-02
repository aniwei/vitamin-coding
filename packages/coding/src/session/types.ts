import type { AgentMessage, AgentTool, ToolCallEvent } from '@vitamin/agent'
import type { Model, ProviderRegistry, ThinkingLevel, WorkflowSlot } from '@vitamin/ai'
import type { HookRegistry } from '@vitamin/hooks'
import type { PromptPreset, SubAgentPromptContext } from '@vitamin/prompt'
import type { Logger } from '@vitamin/shared'
import type { Devtools } from '@vitamin/devtools'
import type { SessionStore } from '@vitamin/session'

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
  hooks?: HookRegistry
  hookRegistry: HookRegistry
  providerRegistry?: ProviderRegistry
  logger: Logger
  devtools?: Devtools
  promptRefresh?: PromptRefresh
}

export interface CreateAgentSessionOptions extends AgentSessionOptions {
  sessionStore?: SessionStore<AgentMessage>
}

export type AgentSessionEventType = AgentSessionEvent['type']

export type AgentSessionEvent =
  | { type: 'session_start'; sessionId: string }
  | { type: 'session_end'; sessionId: string }
  | { type: 'prompt_start'; sessionId: string; text: string }
  | { type: 'prompt_end'; sessionId: string }
  | { type: 'message_persisted'; sessionId: string; role: string }
  | { type: 'agent_status'; sessionId: string; from: string; to: string }
  | { type: 'streaming_start'; sessionId: string; model: string }
  | { type: 'streaming_end'; sessionId: string; model: string; stopReason: string }
  | { type: 'turn_start'; sessionId: string; turnIndex: number }
  | { type: 'turn_end'; sessionId: string; turnIndex: number }
  | { type: 'tool_call_start'; sessionId: string; toolCall: ToolCallEvent }
  | { type: 'tool_call_end'; sessionId: string; toolCall: ToolCallEvent; isError: boolean }
  | { type: 'compaction_start'; sessionId: string; messageCount: number }
  | { type: 'compaction_end'; sessionId: string; retainedCount: number }
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

export type PromptRefresh = () => Promise<string | undefined>
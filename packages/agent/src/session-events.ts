import type { ToolCallEvent, ToolExecutionEvent } from './types'
import type { StreamEvent } from '@x-mars/ai'

export type AgentSessionEventType = AgentSessionEvent['type']

export type AgentSessionEvent =
  | { type: 'session_start'; sessionId: string }
  | { type: 'session_end'; sessionId: string }
  | { type: 'prompt_start'; sessionId: string; text: string }
  | { type: 'prompt_end'; sessionId: string }
  | { type: 'stream_event'; sessionId: string; event: StreamEvent }
  | { type: 'message_persisted'; sessionId: string; role: string }
  | { type: 'agent_status'; sessionId: string; from: string; to: string }
  | { type: 'streaming_start'; sessionId: string; model: string }
  | { type: 'streaming_end'; sessionId: string; model: string; stopReason: string }
  | { type: 'turn_start'; sessionId: string; turnIndex: number }
  | { type: 'turn_end'; sessionId: string; turnIndex: number }
  | { type: 'tool_call_start'; sessionId: string; toolCall: ToolCallEvent }
  | { type: 'tool_execution_event'; sessionId: string; event: ToolExecutionEvent }
  | { type: 'tool_call_end'; sessionId: string; toolCall: ToolCallEvent; isError: boolean }
  | { type: 'plugin_command_diagnostic'; sessionId: string; diagnostic: PluginCommandDiagnostic }
  | { type: 'review_requested'; sessionId: string; review: PatchReviewEvent }
  | { type: 'review_passed'; sessionId: string; review: PatchReviewEvent }
  | { type: 'review_failed'; sessionId: string; review: PatchReviewEvent; issues: string[] }
  | { type: 'compaction_start'; sessionId: string; messageCount: number }
  | { type: 'compaction_end'; sessionId: string; retainedCount: number }
  | {
      type: 'approval_required'
      sessionId: string
      id: string
      toolName: string
      arguments: Record<string, unknown>
      description: string
    }
  | { type: 'approval_resolved'; sessionId: string; id: string; approved: boolean }
  | {
      type: 'ask_user_required'
      sessionId: string
      requestId: string
      questions: AskUserQuestion[]
    }
  | { type: 'ask_user_resolved'; sessionId: string; requestId: string }
  | { type: 'plan_approval_required'; sessionId: string; requestId: string; planContent: string }
  | { type: 'plan_approval_resolved'; sessionId: string; requestId: string; action: string }
  | { type: 'error'; sessionId: string; error: Error }

export interface AskUserQuestion {
  id: string
  text: string
  type?: 'text' | 'choice'
  options?: string[]
}

export interface PatchReviewEvent {
  id: string
  reviewType: 'patch'
  toolCallId: string
  toolName: string
  risk: 'low' | 'medium' | 'high'
  targets: string[]
  blocked: boolean
  reasons: string[]
}

export interface PluginCommandDiagnostic {
  kind: 'plugin-command'
  pluginId: string
  commandName: string
  stage: 'parse' | 'permission' | 'handler' | 'prompt'
  status: 'started' | 'completed' | 'failed' | 'denied' | 'requires_confirmation' | 'handoff'
  confirmed?: boolean
  permission?: string
  effect?: 'allow' | 'deny' | 'ask'
  reason?: string
  message?: string
  resultType?: string
  rawArgumentCount?: number
  argumentNames?: string[]
  typedArgumentKeys?: string[]
}

export type AgentSessionSubscriber = (event: AgentSessionEvent) => void

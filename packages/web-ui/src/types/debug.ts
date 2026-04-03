export const BREAKPOINT_CATEGORIES = {
  'Agent 循环': [
    'loop_start', 'model_before', 'model_after',
    'tool_before', 'tool_after', 'loop_end',
    'loop_cleanup', 'agent_aborted', 'agent_error', 'agent_done',
  ],
  '循环注入': [
    'steering_check', 'follow_up_check', 'context_transform',
  ],
  'Tool 执行': [
    'tool_resolve', 'tool_validate', 'tool_hook_before', 'tool_hook_after',
  ],
  'Session/Prompt': [
    'prompt_before', 'prompt_after', 'context_build',
    'messages_persist', 'session_create', 'session_fork', 'session_restore',
  ],
} as const

export type BreakpointPoint = string

export interface Breakpoint {
  point: BreakpointPoint
  enabled: boolean
}

export interface MessageSummaryItem {
  index: number
  role: 'user' | 'assistant' | 'tool_result' | 'system'
  preview: string
  toolName?: string
  tokenEstimate?: number
}

export interface DebugSnapshot {
  turn: number
  point: BreakpointPoint
  frameDepth: number
  messagesCount: number
  lastToolName?: string
  tokenUsage?: { input: number; output: number }
  metadata?: Record<string, string | number | boolean | null>
  systemPrompt?: string
  messagesSummary?: MessageSummaryItem[]
  llmParams?: {
    temperature?: number
    maxTokens?: number
    thinkingLevel?: string
  }
}

export interface PauseResumePayload {
  systemPrompt?: string
  injectMessages?: { role: 'user' | 'system'; content: string }[]
  removeMessageIndices?: number[]
  llmParams?: {
    temperature?: number
    maxTokens?: number
    thinkingLevel?: string
  }
  metadata?: Record<string, string | number | boolean | null>
}

export type DebugCommandType = 'next' | 'step' | 'over' | 'continue' | 'stop'

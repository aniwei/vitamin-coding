export type BreakpointCategory =
  | 'agent_work_loop'
  | 'work_loop_injection'
  | 'tool_executor'
  | 'session_prompt_lifecycle'
  | 'custom'

export const BREAKPOINT_CATEGORY_LABELS: Record<BreakpointCategory, string> = {
  agent_work_loop: 'Agent 循环',
  work_loop_injection: '循环注入',
  tool_executor: 'Tool 执行',
  session_prompt_lifecycle: 'Session/Prompt',
  custom: '自定义',
}

export type BreakpointPoint = string

export interface Breakpoint {
  point: BreakpointPoint
  name?: string
  category?: BreakpointCategory
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

export type CommandRejectCode =
  | 'STALE_OR_NO_PAUSE'
  | 'INVALID_PARAMS'
  | 'DEBUGGER_OFFLINE'
  | 'BRIDGE_DISCONNECTED'

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

export type DebuggerCommandMethod =
  | 'Debugger.resume'
  | 'Debugger.stepOver'
  | 'Debugger.stepInto'
  | 'Debugger.disable'

export interface DebuggerCommandParams {
  payload?: PauseResumePayload
}

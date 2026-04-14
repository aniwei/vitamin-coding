export type BreakpointCategory =
  | 'agent_work_loop'
  | 'work_loop_injection'
  | 'tool_executor'
  | 'session_prompt_lifecycle'
  | 'custom'

export const BREAKPOINT_POINTS = [
  // ─── Agent work-loop ───
  { point: 'loop_start', name: 'Loop Start', category: 'agent_work_loop' },
  { point: 'model_before', name: 'Model Before', category: 'agent_work_loop' },
  { point: 'model_after', name: 'Model After', category: 'agent_work_loop' },
  { point: 'tool_before', name: 'Tool Before', category: 'agent_work_loop' },
  { point: 'tool_after', name: 'Tool After', category: 'agent_work_loop' },
  { point: 'loop_end', name: 'Loop End', category: 'agent_work_loop' },
  { point: 'loop_cleanup', name: 'Loop Cleanup', category: 'agent_work_loop' },
  { point: 'agent_aborted', name: 'Agent Aborted', category: 'agent_work_loop' },
  { point: 'agent_error', name: 'Agent Error', category: 'agent_work_loop' },
  { point: 'agent_done', name: 'Agent Done', category: 'agent_work_loop' },
  // ─── Work-loop 注入点 ───
  { point: 'steering_check', name: 'Steering Check', category: 'work_loop_injection' },
  { point: 'follow_up_check', name: 'Follow Up Check', category: 'work_loop_injection' },
  { point: 'context_transform', name: 'Context Transform', category: 'work_loop_injection' },
  // ─── Tool executor 内部 ───
  { point: 'tool_resolve', name: 'Tool Resolve', category: 'tool_executor' },
  { point: 'tool_validate', name: 'Tool Validate', category: 'tool_executor' },
  { point: 'tool_hook_before', name: 'Tool Hook Before', category: 'tool_executor' },
  { point: 'tool_hook_after', name: 'Tool Hook After', category: 'tool_executor' },
  // ─── Prompt / Session 生命周期 ───
  { point: 'prompt_before', name: 'Prompt Before', category: 'session_prompt_lifecycle' },
  { point: 'prompt_after', name: 'Prompt After', category: 'session_prompt_lifecycle' },
  { point: 'context_build', name: 'Context Build', category: 'session_prompt_lifecycle' },
  { point: 'messages_persist', name: 'Messages Persist', category: 'session_prompt_lifecycle' },
  { point: 'session_create', name: 'Session Create', category: 'session_prompt_lifecycle' },
  { point: 'session_fork', name: 'Session Fork', category: 'session_prompt_lifecycle' },
  { point: 'session_restore', name: 'Session Restore', category: 'session_prompt_lifecycle' },
] as const

export type BreakpointPoint = (typeof BREAKPOINT_POINTS)[number]['point']
export type BreakpointDefinition = (typeof BREAKPOINT_POINTS)[number]

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

export interface InjectedMessage {
  role: 'user' | 'system'
  content: string
}

export interface PauseResumePayload {
  systemPrompt?: string
  injectMessages?: InjectedMessage[]
  removeMessageIndices?: number[]
  llmParams?: {
    temperature?: number
    maxTokens?: number
    thinkingLevel?: string
  }
  metadata?: Record<string, string | number | boolean | null>
}

export interface PauseResult {
  pauseId: string
  command: DebugCommand
  payload: PauseResumePayload | null
}

// ─── CDP-style method → internal command type mapping ───
export const CDP_METHOD_TO_COMMAND: Record<string, DebugCommand['type']> = {
  'Debugger.resume': 'continue',
  'Debugger.stepOver': 'next',
  'Debugger.stepInto': 'step',
  'Debugger.disable': 'stop',
}

export type CDPDebugMethod = keyof typeof CDP_METHOD_TO_COMMAND

// ─── Command rejection codes ───
export type CommandRejectCode =
  | 'STALE_OR_NO_PAUSE'
  | 'INVALID_PARAMS'
  | 'DEBUGGER_OFFLINE'
  | 'BRIDGE_DISCONNECTED'

export type DebuggerEvent = {
  type: 'Debugger.paused'
  pauseId: string
  seq: number
  point: BreakpointPoint
  frameDepth: number
  snapshot: DebugSnapshot
}

export type DebugCommand =
  | { type: 'next'; seq: number }
  | { type: 'step'; seq: number }
  | { type: 'over'; seq: number; depth: number }
  | { type: 'continue'; seq: number }
  | { type: 'stop'; seq: number; reason?: string }

export function isDebugCommand(input: unknown): input is DebugCommand {
  if (!input || typeof input !== 'object') {
    return false
  }

  const value = input as Record<string, unknown>
  if (typeof value.type !== 'string' || typeof value.seq !== 'number') {
    return false
  }

  switch (value.type) {
    case 'next':
    case 'step':
    case 'continue':
      return true
    case 'over':
      return typeof value.depth === 'number'
    case 'stop':
      return typeof value.reason === 'undefined' || typeof value.reason === 'string'
    default:
      return false
  }
}

export function isDebuggerEvent(input: unknown): input is DebuggerEvent {
  if (!input || typeof input !== 'object') {
    return false
  }
  const value = input as Record<string, unknown>

  if (value.type !== 'Debugger.paused') {
    return false
  }

  if (
    typeof value.seq !== 'number' ||
    typeof value.point !== 'string' ||
    typeof value.frameDepth !== 'number'
  ) {
    return false
  }

  if (!value.snapshot || typeof value.snapshot !== 'object') {
    return false
  }

  const snapshot = value.snapshot as Record<string, unknown>
  if (
    typeof snapshot.turn !== 'number' ||
    typeof snapshot.point !== 'string' ||
    typeof snapshot.frameDepth !== 'number'
  ) {
    return false
  }

  if (typeof snapshot.messagesCount !== 'number') {
    return false
  }

  if (typeof snapshot.lastToolName !== 'undefined' && typeof snapshot.lastToolName !== 'string') {
    return false
  }

  if (typeof snapshot.tokenUsage !== 'undefined') {
    if (!snapshot.tokenUsage || typeof snapshot.tokenUsage !== 'object') {
      return false
    }

    const usage = snapshot.tokenUsage as Record<string, unknown>
    if (typeof usage.input !== 'number' || typeof usage.output !== 'number') {
      return false
    }
  }

  return true
}

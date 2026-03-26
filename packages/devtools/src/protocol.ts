export const BREAKPOINT_POINTS = [
  // ─── Agent work-loop ───
  'loop_start',
  'model_before',
  'model_after',
  'tool_before',
  'tool_after',
  'loop_end',
  'loop_cleanup',
  'agent_aborted',
  'agent_error',
  'agent_done',
  // ─── Work-loop 注入点 ───
  'steering_check',
  'follow_up_check',
  'context_transform',
  // ─── Tool executor 内部 ───
  'tool_resolve',
  'tool_validate',
  'tool_hook_before',
  'tool_hook_after',
  // ─── Prompt / Session 生命周期 ───
  'prompt_before',
  'prompt_after',
  'context_build',
  'messages_persist',
  'session_create',
  'session_fork',
  'session_restore',
] as const

export type BreakpointPoint = (typeof BREAKPOINT_POINTS)[number]

export interface DebugSnapshot {
  turn: number
  point: BreakpointPoint
  frameDepth: number
  messagesCount: number
  lastToolName?: string
  tokenUsage?: { input: number; output: number }
  metadata?: Record<string, string | number | boolean | null>
}

export type DebuggerEvent =
  | {
      type: 'Agent.debugger.paused'
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
  if (!input || typeof input !== 'object') return false

  const value = input as Record<string, unknown>
  if (typeof value.type !== 'string' || typeof value.seq !== 'number') return false

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
  if (!input || typeof input !== 'object') return false
  const value = input as Record<string, unknown>

  if (value.type !== 'Agent.debugger.paused') {
    return false
  }

  if (typeof value.seq !== 'number' || typeof value.point !== 'string' || typeof value.frameDepth !== 'number') {
    return false
  }

  if (!value.snapshot || typeof value.snapshot !== 'object') {
    return false
  }

  const snapshot = value.snapshot as Record<string, unknown>
  if (typeof snapshot.turn !== 'number' || typeof snapshot.point !== 'string' || typeof snapshot.frameDepth !== 'number') {
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

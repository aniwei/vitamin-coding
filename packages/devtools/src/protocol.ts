export type BreakpointPoint =
  | 'loop_start'
  | 'model_before'
  | 'model_after'
  | 'tool_before'
  | 'tool_after'
  | 'loop_end'
  | 'agent_error'
  | 'agent_done'

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

  if (value.type === 'breakpoint-hit') {
    return typeof value.seq === 'number' && typeof value.point === 'string' && typeof value.frameDepth === 'number'
  }

  if (value.type === 'agent-finished') {
    if (typeof value.seq !== 'number' || !value.result || typeof value.result !== 'object') {
      return false
    }

    const result = value.result as Record<string, unknown>
    if (result.status !== 'ok' && result.status !== 'error' && result.status !== 'aborted') {
      return false
    }

    return typeof result.reason === 'undefined' || typeof result.reason === 'string'
  }

  return false
}

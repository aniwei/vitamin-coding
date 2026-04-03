import type { AgentSessionEvent } from '@vitamin/coding'
import type { Devtools } from '@vitamin/devtools'

// ─── CDP-inspired domain protocol ───
//
// Inspired by Chrome DevTools Protocol:
//   - Events use `Domain.event` naming: 'Debugger.paused', 'Log.entryAdded'
//   - Commands use `Domain.method` naming: 'Debugger.resume', 'Debugger.setBreakpoint'
//   - All messages serialised as { type, data } (keeping existing WS envelope)
//
// Domains:
//   Debugger — breakpoint management, pause/resume, context writeback
//   Log      — structured log streaming + history

// ─── WebSocket protocol (server → client) ───
export type WebSocketEventType =
  | 'connected'
  | 'pong'
  | 'user_message'
  | 'message_start'
  | 'message_chunk'
  | 'message_complete'
  | 'thinking_block'
  | 'tool_call'
  | 'tool_result'
  | 'nested_tool_call'
  | 'nested_tool_result'
  | 'approval_required'
  | 'approval_resolved'
  | 'ask_user_required'
  | 'ask_user_resolved'
  | 'plan_approval_required'
  | 'plan_approval_resolved'
  | 'plan_content'
  | 'subagent_start'
  | 'subagent_complete'
  | 'parallel_agents_start'
  | 'parallel_agents_done'
  | 'task_completed'
  | 'progress'
  | 'status_update'
  | 'session_activity'
  | 'error'
  | 'mcp_status_update'
  | 'mcp_servers_update'
  // ─── Debugger domain events ───
  | 'Debugger.paused'
  | 'Debugger.resumed'
  | 'Debugger.breakpointsChanged'
  // ─── Log domain events ───
  | 'Log.entryAdded'
  // ─── Legacy aliases (deprecated, kept for compat) ───
  | 'debug_paused'
  | 'debug_resumed'
  | 'debug_command'
  | 'debug_breakpoints'
  | 'log_entry'
  | 'log_batch'

export interface WebSocketMessage {
  type: WebSocketEventType
  data: Record<string, unknown>
}

// ─── WebSocket protocol (client → server) ───
export type WebSocketClientMessageType =
  | 'ping'
  | 'approve'
  | 'reject'
  | 'ask_user_response'
  | 'plan_approve'
  | 'plan_reject'
  | 'subscribe_session'
  | 'unsubscribe_session'
  // ─── Debugger domain commands ───
  | 'Debugger.resume'
  | 'Debugger.stepOver'
  | 'Debugger.stepInto'
  | 'Debugger.disable'
  | 'Debugger.setBreakpoint'
  | 'Debugger.setBreakpointsActive'
  // ─── Log domain commands ───
  | 'Log.enable'
  | 'Log.disable'
  | 'Log.clear'
  // ─── Legacy aliases (deprecated, kept for compat) ───
  | 'debug_command'
  | 'debug_set_breakpoint'
  | 'debug_subscribe'
  | 'log_subscribe'

export interface WebSocketClientMessage {
  type: WebSocketClientMessageType
  data: Record<string, unknown>
}

// ─── Service options ───
export interface CodingServiceOptions {
  host?: string
  port: number
  staticDir?: string
  cors?: string
  devtools?: Devtools
}

// ─── Event bridge: maps internal events → WS events ───
export type EventBridgeMapper = (
  event: AgentSessionEvent,
) => WebSocketMessage | WebSocketMessage[] | null

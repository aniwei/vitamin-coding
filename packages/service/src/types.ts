import type { AgentSessionEvent } from '@vitamin/coding'

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
  // ─── CDP-style generic/runtime commands ───
  | 'Runtime.ping'
  | 'Chat.query'
  | 'Chat.approval'
  | 'Chat.askUserResponse'
  | 'Chat.planApprovalResponse'
  | 'Session.subscribe'
  | 'Session.unsubscribe'
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
}

// ─── Event bridge: maps internal events → WS events ───
export type EventBridgeMapper = (
  event: AgentSessionEvent,
) => WebSocketMessage | WebSocketMessage[] | null

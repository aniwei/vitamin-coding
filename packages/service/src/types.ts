import type { AgentSessionEvent } from '@vitamin/coding'

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

export interface WebSocketClientMessage {
  type: WebSocketClientMessageType
  data: Record<string, unknown>
}

// ─── Service options ───
export interface CodingServiceOptions {
  host?: string
  port: number
  /** serve web-ui static files from this directory */
  staticDir?: string
  /** CORS origin for dev mode  */
  corsOrigin?: string
}

// ─── Event bridge: maps internal events → WS events ───
export type EventBridgeMapper = (
  event: AgentSessionEvent,
) => WebSocketMessage | WebSocketMessage[] | null

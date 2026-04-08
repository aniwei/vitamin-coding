import type { AgentSessionEvent } from '@vitamin/agent'

export type WebSocketEventType =
  | 'Runtime.connected'
  | 'Runtime.pong'
  | 'Chat.userMessage'
  | 'Chat.messageStart'
  | 'Chat.messageChunk'
  | 'Chat.messageComplete'
  | 'Chat.thinkingBlock'
  | 'Chat.toolCall'
  | 'Chat.toolResult'
  | 'Chat.nestedToolCall'
  | 'Chat.nestedToolResult'
  | 'Chat.approvalRequired'
  | 'Chat.approvalResolved'
  | 'Chat.askUserRequired'
  | 'Chat.askUserResolved'
  | 'Chat.planApprovalRequired'
  | 'Chat.planApprovalResolved'
  | 'Chat.planContent'
  | 'Chat.subagentStart'
  | 'Chat.subagentComplete'
  | 'Chat.parallelAgentsStart'
  | 'Chat.parallelAgentsDone'
  | 'Chat.taskCompleted'
  | 'Chat.progress'
  | 'Session.statusUpdate'
  | 'Session.activity'
  | 'Runtime.error'
  | 'MCP.statusUpdate'
  | 'MCP.serversUpdate'
  // ─── Debugger domain events ───
  | 'Debugger.paused'
  | 'Debugger.resumed'
  | 'Debugger.commandRejected'
  | 'Debugger.breakpointsChanged'
  // ─── Log domain events ───
  | 'Log.entryAdded'

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

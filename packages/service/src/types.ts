import type { AgentSessionEvent } from '@vitamin/agent'
import type { WebSocketMessage } from '@vitamin/protocol'

export type {
  WebSocketMessage,
  WebSocketEventType,
  WebSocketClientMessage,
  WebSocketClientMessageType,
  LogEntryData,
  ChatQueryData,
  ChatApprovalData,
  ChatAskUserResponseData,
  ChatPlanApprovalResponseData,
  ChatReviewResponseData,
  SessionSubscribeData,
  DebuggerCommandData,
  DebuggerSetBreakpointData,
  DebuggerSetBreakpointsActiveData,
} from '@vitamin/protocol'

// ─── Service options ──────────────────────────────────────────────────────────

export interface CodingServiceOptions {
  host?: string
  port: number
  staticDir?: string
  cors?: string
  websocketAuthToken?: string
}

// ─── Message sender interface ─────────────────────────────────────────────────
// EventBridge 和 DebugBridge 依赖此接口而非具体的 WebSocketManager

export interface IMessageSender {
  broadcast(message: WebSocketMessage): void
  sendToSession(sessionId: string, message: WebSocketMessage): void
}

// ─── Event bridge: maps internal events → WS events ──────────────────────────

export type EventBridgeMapper = (
  event: AgentSessionEvent,
) => WebSocketMessage | WebSocketMessage[] | null

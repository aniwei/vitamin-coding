import type { AgentSessionEvent } from '@x-mars/agent'
import type { WebSocketMessage } from '@x-mars/protocol'

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
} from '@x-mars/protocol'

// ─── Service options ──────────────────────────────────────────────────────────

export interface CodingServiceOptions {
  host?: string
  port: number
  staticDir?: string
  cors?: string
  websocketAuthToken?: string
  scheduler?: {
    /** Defaults to true when the XMars context exposes a scheduler. */
    enabled?: boolean
    /** Defaults to 60 seconds. */
    tickIntervalMs?: number
    /** Defaults to true so due jobs are picked up immediately on service start. */
    tickOnStart?: boolean
  }
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

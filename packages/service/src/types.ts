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
  GatewayMessageReceivedData,
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
  gateway?: {
    /** Defaults to true. Set false to disable the gateway HTTP route. */
    enabled?: boolean
    /** Optional shared secret accepted via Authorization: Bearer <secret> or x-x-mars-webhook-secret. */
    webhookSecret?: string
    /** Optional outbound webhook URL for session events produced by gateway sessions. */
    deliveryUrl?: string
    /** Optional outbound bearer token used when posting delivery events. */
    deliverySecret?: string
    /** Optional HMAC secret used to sign outbound delivery payloads. */
    deliverySigningSecret?: string
    /** Number of retry attempts after the initial outbound delivery attempt. Defaults to 2. */
    deliveryRetries?: number
    /** Test/runtime injection point for outbound delivery. Defaults to global fetch. */
    deliveryFetch?: typeof fetch
  }
}

export interface GatewayWebhookBody {
  message?: string
  sessionId?: string
  channel?: string
  userId?: string
  threadId?: string
  metadata?: Record<string, unknown>
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

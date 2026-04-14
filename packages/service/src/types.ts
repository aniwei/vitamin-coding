import type { AgentSessionEvent } from '@vitamin/agent'

// ─── WebSocket server → client messages (discriminated union) ─────────────────

export type WebSocketMessage =
  // ── Runtime ──────────────────────────────────────────────────────────────
  | { type: 'Runtime.connected'; data: { clientId: string } }
  | { type: 'Runtime.pong'; data: { timestamp: number } }
  | { type: 'Runtime.error'; data: { sessionId?: string; message: string } }
  // ── Chat lifecycle ────────────────────────────────────────────────────────
  | { type: 'Chat.userMessage'; data: { sessionId: string; content: string; timestamp: string } }
  | { type: 'Chat.messageStart'; data: { sessionId: string; role: string } }
  | { type: 'Chat.messageChunk'; data: { sessionId: string; content: string; role: string } }
  | { type: 'Chat.messageComplete'; data: { sessionId: string } }
  | {
      type: 'Chat.thinkingBlock'
      data: {
        sessionId: string
        action: 'start' | 'delta' | 'end'
        index: number
        delta?: string
        content?: string
      }
    }
  // ── Tool calls ────────────────────────────────────────────────────────────
  | {
      type: 'Chat.toolCall'
      data: {
        sessionId: string
        id: string
        name: string
        arguments: Record<string, unknown>
        status: 'started'
      }
    }
  | {
      type: 'Chat.toolResult'
      data: { sessionId: string; id: string; name: string; isError: boolean }
    }
  | {
      type: 'Chat.nestedToolCall'
      data: { sessionId: string; id: string; name: string; arguments: Record<string, unknown> }
    }
  | { type: 'Chat.nestedToolResult'; data: { sessionId: string; id: string; isError: boolean } }
  // ── Approval & interaction ────────────────────────────────────────────────
  | {
      type: 'Chat.approvalRequired'
      data: {
        sessionId: string
        id: string
        toolName: string
        arguments: Record<string, unknown>
        description: string
      }
    }
  | { type: 'Chat.approvalResolved'; data: { sessionId: string; id: string; approved: boolean } }
  | {
      type: 'Chat.askUserRequired'
      data: { sessionId: string; requestId: string; questions: unknown[] }
    }
  | { type: 'Chat.askUserResolved'; data: { sessionId: string; requestId: string } }
  | {
      type: 'Chat.planApprovalRequired'
      data: { sessionId: string; requestId: string; planContent: string }
    }
  | {
      type: 'Chat.planApprovalResolved'
      data: { sessionId: string; requestId: string; action: string }
    }
  | { type: 'Chat.planContent'; data: { sessionId: string; content: string } }
  // ── Orchestration ─────────────────────────────────────────────────────────
  | { type: 'Chat.subagentStart'; data: { sessionId: string; agentName: string } }
  | { type: 'Chat.subagentComplete'; data: { sessionId: string; agentName: string } }
  | { type: 'Chat.parallelAgentsStart'; data: { sessionId: string; count: number } }
  | { type: 'Chat.parallelAgentsDone'; data: { sessionId: string } }
  | { type: 'Chat.taskCompleted'; data: { sessionId: string; taskId: string } }
  | { type: 'Chat.progress'; data: { sessionId: string; phase: string; turnIndex?: number } }
  // ── Session ───────────────────────────────────────────────────────────────
  | {
      type: 'Session.statusUpdate'
      data: {
        sessionId: string
        status: string
        model?: string
        stopReason?: string
        messageCount?: number
        retainedCount?: number
      }
    }
  | { type: 'Session.activity'; data: { sessionId: string; action: string; timestamp: string } }
  // ── MCP ───────────────────────────────────────────────────────────────────
  | { type: 'MCP.statusUpdate'; data: { serverId: string; status: string } }
  | { type: 'MCP.serversUpdate'; data: { servers: unknown[] } }
  // ── Debugger ──────────────────────────────────────────────────────────────
  | {
      type: 'Debugger.paused'
      data: {
        reason: string
        pauseId: string
        point?: unknown
        snapshot?: Record<string, unknown>
        timestamp: string
      }
    }
  | { type: 'Debugger.resumed'; data: { pauseId: string; command?: unknown; timestamp: string } }
  | {
      type: 'Debugger.commandRejected'
      data: { code: string; pauseId?: string; command?: unknown; timestamp: string }
    }
  | { type: 'Debugger.breakpointsChanged'; data: { breakpoints: unknown[] } }
  // ── Log ───────────────────────────────────────────────────────────────────
  | { type: 'Log.entryAdded'; data: { entry: LogEntryData } }

export type WebSocketEventType = WebSocketMessage['type']

export interface LogEntryData {
  id: number
  timestamp: string
  level: string
  module: string
  message: string
  data?: Record<string, unknown>
}

// ─── WebSocket client → server messages ───────────────────────────────────────

/**
 * 客户端发来的消息在传输层统一为此形式，data 字段在各 handler 中按协议解析。
 * 具体各消息的 data shape 见 WebSocketClientData 类型映射。
 */
export interface WebSocketClientMessage {
  type: WebSocketClientMessageType
  data: Record<string, unknown>
}

export type WebSocketClientMessageType =
  // ── Runtime ──────────────────────────────────────────────────────────────
  | 'Runtime.ping'
  // ── Chat ─────────────────────────────────────────────────────────────────
  | 'Chat.query'
  | 'Chat.approval'
  | 'Chat.askUserResponse'
  | 'Chat.planApprovalResponse'
  // ── Session subscription ──────────────────────────────────────────────────
  | 'Session.subscribe'
  | 'Session.unsubscribe'
  // ── Debugger ──────────────────────────────────────────────────────────────
  | 'Debugger.resume'
  | 'Debugger.stepOver'
  | 'Debugger.stepInto'
  | 'Debugger.disable'
  | 'Debugger.setBreakpoint'
  | 'Debugger.setBreakpointsActive'
  // ── Log ───────────────────────────────────────────────────────────────────
  | 'Log.enable'
  | 'Log.disable'
  | 'Log.clear'

// ─── Per-message data shapes (used in InboundRouter for safe extraction) ─────

export interface ChatQueryData {
  message: string
  sessionId?: string
}

export interface ChatApprovalData {
  approvalId: string
  approved: boolean
  sessionId?: string
}

export interface ChatAskUserResponseData {
  requestId: string
  answers: Record<string, unknown> | null
  cancelled?: boolean
  sessionId?: string
}

export interface ChatPlanApprovalResponseData {
  requestId: string
  action: string
  feedback?: string
  sessionId?: string
}

export interface SessionSubscribeData {
  sessionId: string
}

export interface DebuggerCommandData {
  seq?: number
  pauseId?: string
  depth?: number
}

export interface DebuggerSetBreakpointData {
  point: string
  enabled: boolean
}

export interface DebuggerSetBreakpointsActiveData {
  active: boolean
}

// ─── Service options ──────────────────────────────────────────────────────────

export interface CodingServiceOptions {
  host?: string
  port: number
  staticDir?: string
  cors?: string
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

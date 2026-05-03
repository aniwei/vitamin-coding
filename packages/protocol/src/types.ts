export type RuntimeConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'stale'

export interface RuntimeConnectionStateData {
  clientId?: string
  status: RuntimeConnectionStatus
  timestamp: string
  attempt?: number
  delayMs?: number
  queuedCommands?: number
}

export interface LogEntryData {
  id: number
  timestamp: string
  level: string
  module: string
  message: string
  data?: Record<string, unknown>
}

export type ProtocolToolExecutionEvent =
  | {
      type: 'started'
      toolCallId: string
      toolName: string
      args: Record<string, unknown>
      timestamp: number
    }
  | {
      type: 'approval_required'
      toolCallId: string
      toolName: string
      args: Record<string, unknown>
      reason: string
      timestamp: number
    }
  | {
      type: 'approval_resolved'
      toolCallId: string
      toolName: string
      approved: boolean
      timestamp: number
    }
  | {
      type: 'progress'
      toolCallId: string
      toolName: string
      update: string
      timestamp: number
    }
  | {
      type: 'error'
      toolCallId: string
      toolName: string
      message: string
      timestamp: number
    }
  | {
      type: 'result'
      toolCallId: string
      toolName: string
      result: unknown
      sideEffects?: unknown[]
      durationMs: number
      timestamp: number
    }

export interface ProtocolPatchReviewEvent {
  id: string
  reviewType: 'patch'
  toolCallId: string
  toolName: string
  risk: 'low' | 'medium' | 'high'
  targets: string[]
  blocked: boolean
  reasons: string[]
}

export interface ProtocolPluginCommandDiagnostic {
  kind: 'plugin-command'
  pluginId: string
  commandName: string
  stage: string
  status: string
  confirmed?: boolean
  permission?: string
  effect?: string
  reason?: string
  message?: string
  resultType?: string
  rawArgumentCount?: number
  argumentNames?: string[]
  typedArgumentKeys?: string[]
}

export type WebSocketMessage =
  | { type: 'Runtime.connected'; data: { clientId: string } }
  | { type: 'Runtime.connectionState'; data: RuntimeConnectionStateData }
  | { type: 'Runtime.pong'; data: { timestamp: number } }
  | { type: 'Runtime.error'; data: { sessionId?: string; message: string } }
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
      type: 'Chat.toolExecutionEvent'
      data: { sessionId: string; event: ProtocolToolExecutionEvent }
    }
  | {
      type: 'Plugin.commandDiagnostic'
      data: { sessionId: string; diagnostic: ProtocolPluginCommandDiagnostic }
    }
  | {
      type: 'Chat.nestedToolCall'
      data: { sessionId: string; id: string; name: string; arguments: Record<string, unknown> }
    }
  | { type: 'Chat.nestedToolResult'; data: { sessionId: string; id: string; isError: boolean } }
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
  | { type: 'Chat.reviewRequested'; data: { sessionId: string; review: ProtocolPatchReviewEvent } }
  | { type: 'Chat.reviewPassed'; data: { sessionId: string; review: ProtocolPatchReviewEvent } }
  | {
      type: 'Chat.reviewFailed'
      data: { sessionId: string; review: ProtocolPatchReviewEvent; issues: string[] }
    }
  | {
      type: 'Chat.subagentStart'
      data: {
        sessionId: string
        agentName: string
        subagentId?: string
        taskId?: string
        toolCallId?: string
        agentType?: string
        subagentName?: string
        task?: string
        description?: string
      }
    }
  | {
      type: 'Chat.subagentComplete'
      data: {
        sessionId: string
        agentName: string
        subagentId?: string
        taskId?: string
        toolCallId?: string
        success?: boolean
        summary?: string
        resultSummary?: string
        outputTail?: string
        childSessionId?: string
      }
    }
  | { type: 'Chat.parallelAgentsStart'; data: { sessionId: string; count: number } }
  | { type: 'Chat.parallelAgentsDone'; data: { sessionId: string } }
  | {
      type: 'Chat.taskCompleted'
      data: {
        sessionId: string
        taskId: string
        agentName?: string
        status?: string
        summary?: string
        outputTail?: string
        childSessionId?: string
      }
    }
  | { type: 'Chat.progress'; data: { sessionId: string; phase: string; turnIndex?: number } }
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
  | { type: 'MCP.statusUpdate'; data: { serverId: string; status: string } }
  | { type: 'MCP.serversUpdate'; data: { servers: unknown[] } }
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
  | { type: 'Log.entryAdded'; data: { entry: LogEntryData } }

export type WebSocketEventType = WebSocketMessage['type']

export interface WebSocketClientMessage {
  type: WebSocketClientMessageType
  data: Record<string, unknown>
}

export type WebSocketClientMessageType =
  | 'Runtime.ping'
  | 'Chat.query'
  | 'Chat.approval'
  | 'Chat.askUserResponse'
  | 'Chat.planApprovalResponse'
  | 'Chat.reviewResponse'
  | 'Session.subscribe'
  | 'Session.unsubscribe'
  | 'Debugger.resume'
  | 'Debugger.stepOver'
  | 'Debugger.stepInto'
  | 'Debugger.disable'
  | 'Debugger.setBreakpoint'
  | 'Debugger.setBreakpointsActive'
  | 'Log.enable'
  | 'Log.disable'
  | 'Log.clear'

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

export interface ChatReviewResponseData {
  reviewId: string
  approved: boolean
  issues?: string[]
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

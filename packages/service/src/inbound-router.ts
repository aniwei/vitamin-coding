/**
 * 将前端消息路由从 CodingService 中分离，
 * 使 CodingService 只做组件编排，不写业务逻辑。
 */

import { createLogger } from '@vitamin/shared'
import type { WebSocketManager } from './websocket-manager'
import type {
  WebSocketClientMessage,
  ChatQueryData,
  ChatApprovalData,
  ChatAskUserResponseData,
  ChatPlanApprovalResponseData,
  SessionSubscribeData,
  DebuggerCommandData,
  DebuggerSetBreakpointData,
  DebuggerSetBreakpointsActiveData,
} from './types'
import type { DebugBridge } from './debug-bridge'
import type { VitaminContext } from '@vitamin/coding'
import type { PauseResumePayload } from '@vitamin/devtools'

const logger = createLogger('@vitamin/service:inbound-router')

// ─── Data extraction helpers ─────────────────────────────────────────────────

function extractString(data: Record<string, unknown>, key: string): string | undefined {
  const v = data[key]
  return typeof v === 'string' ? v : undefined
}

function extractBoolean(data: Record<string, unknown>, key: string): boolean | undefined {
  const v = data[key]
  return typeof v === 'boolean' ? v : undefined
}

function extractNumber(data: Record<string, unknown>, key: string): number | undefined {
  const v = data[key]
  return typeof v === 'number' ? v : undefined
}

function extractRecord(
  data: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const v = data[key]
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined
}

function parseChatQuery(data: Record<string, unknown>): ChatQueryData | null {
  const message = extractString(data, 'message')
  if (!message) return null
  return { message, sessionId: extractString(data, 'sessionId') }
}

function parseChatApproval(data: Record<string, unknown>): ChatApprovalData | null {
  const approvalId = extractString(data, 'approvalId')
  const approved = extractBoolean(data, 'approved')
  if (!approvalId || approved === undefined) return null
  return { approvalId, approved, sessionId: extractString(data, 'sessionId') }
}

function parseChatAskUserResponse(data: Record<string, unknown>): ChatAskUserResponseData | null {
  const requestId = extractString(data, 'requestId')
  if (!requestId) return null
  const cancelled = data.cancelled === true
  const answers = cancelled ? null : (extractRecord(data, 'answers') ?? null)
  return { requestId, answers, cancelled, sessionId: extractString(data, 'sessionId') }
}

function parseChatPlanApprovalResponse(
  data: Record<string, unknown>,
): ChatPlanApprovalResponseData | null {
  const requestId = extractString(data, 'requestId')
  const action = extractString(data, 'action')
  if (!requestId || !action) return null
  return {
    requestId,
    action,
    feedback: extractString(data, 'feedback'),
    sessionId: extractString(data, 'sessionId'),
  }
}

function parseSessionSubscribe(data: Record<string, unknown>): SessionSubscribeData | null {
  const sessionId = extractString(data, 'sessionId')
  if (!sessionId) return null
  return { sessionId }
}

function parseDebuggerCommand(data: Record<string, unknown>): DebuggerCommandData {
  return {
    seq: extractNumber(data, 'seq'),
    pauseId: extractString(data, 'pauseId'),
    depth: extractNumber(data, 'depth'),
  }
}

function parseDebuggerSetBreakpoint(
  data: Record<string, unknown>,
): DebuggerSetBreakpointData | null {
  const point = extractString(data, 'point')
  const enabled = extractBoolean(data, 'enabled')
  if (point === undefined || enabled === undefined) return null
  return { point, enabled }
}

function parseDebuggerSetBreakpointsActive(
  data: Record<string, unknown>,
): DebuggerSetBreakpointsActiveData | null {
  const active = extractBoolean(data, 'active')
  if (active === undefined) return null
  return { active }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export class InboundRouter {
  constructor(
    private readonly ws: WebSocketManager,
    private readonly vitamin: VitaminContext,
    private readonly bridge: DebugBridge | null,
  ) {}

  dispatch(clientId: string, message: WebSocketClientMessage): void {
    const { type, data } = message

    logger.debug(`message from client ${clientId}: ${type}`)

    switch (type) {
      // ── Session subscription ────────────────────────────────────────────────
      case 'Session.subscribe': {
        const parsed = parseSessionSubscribe(data)
        if (parsed) this.ws.subscribeClient(clientId, parsed.sessionId)
        break
      }

      case 'Session.unsubscribe': {
        const parsed = parseSessionSubscribe(data)
        if (parsed) this.ws.unsubscribeClient(clientId, parsed.sessionId)
        break
      }

      // ── Chat business commands ──────────────────────────────────────────────
      case 'Chat.query': {
        const parsed = parseChatQuery(data)
        if (parsed) this.handleQuery(parsed)
        break
      }

      case 'Chat.approval': {
        const parsed = parseChatApproval(data)
        if (parsed) this.handleApproval(parsed)
        break
      }

      case 'Chat.askUserResponse': {
        const parsed = parseChatAskUserResponse(data)
        if (parsed) this.handleAskUserResponse(parsed)
        break
      }

      case 'Chat.planApprovalResponse': {
        const parsed = parseChatPlanApprovalResponse(data)
        if (parsed) this.handlePlanApprovalResponse(parsed)
        break
      }

      // ── Debugger commands ───────────────────────────────────────────────────
      case 'Debugger.resume':
      case 'Debugger.stepOver':
      case 'Debugger.stepInto':
      case 'Debugger.disable':
        this.handleDebugCommand(type, parseDebuggerCommand(data), data)
        break

      case 'Debugger.setBreakpoint': {
        const parsed = parseDebuggerSetBreakpoint(data)
        if (parsed) this.handleDebugSetBreakpoint(parsed)
        break
      }

      case 'Debugger.setBreakpointsActive': {
        const parsed = parseDebuggerSetBreakpointsActive(data)
        if (parsed) this.handleDebugSetBreakpointsActive(parsed)
        break
      }

      default:
        logger.debug(`unknown client message type: ${type}`)
    }
  }

  private resolveSession(sessionId?: string) {
    return sessionId ? this.vitamin.getSession(sessionId) : this.vitamin.getActiveSession()
  }

  private handleQuery({ message, sessionId }: ChatQueryData): void {
    const session = this.resolveSession(sessionId)
    if (!session) return

    session.prompt(message).catch((err: Error) => {
      this.ws.sendToSession(session.id, {
        type: 'Runtime.error',
        data: { sessionId: session.id, message: err.message },
      })
    })
  }

  private handleApproval({ approvalId, approved, sessionId }: ChatApprovalData): void {
    const session = this.resolveSession(sessionId)
    if (!session) return

    session.resolveApproval(approvalId, approved)
    logger.debug(`${approved ? 'approval' : 'rejection'} for session ${session.id}`)
  }

  private handleAskUserResponse({ requestId, answers, sessionId }: ChatAskUserResponseData): void {
    const session = this.resolveSession(sessionId)
    if (!session) return

    session.resolveAskUser(requestId, answers)
    logger.debug(`ask_user response for session ${session.id}`)
  }

  private handlePlanApprovalResponse({
    requestId,
    action,
    feedback,
    sessionId,
  }: ChatPlanApprovalResponseData): void {
    const session = this.resolveSession(sessionId)
    if (!session) return

    session.resolvePlanApproval(requestId, action, feedback)
    logger.debug(`plan ${action} for session ${session.id}`)
  }

  private handleDebugCommand(
    method: string,
    { seq, pauseId, depth }: DebuggerCommandData,
    rawData: Record<string, unknown>,
  ): void {
    if (!this.bridge) return

    const payload = extractRecord(rawData, 'payload') as PauseResumePayload | undefined

    this.bridge.send(
      {
        type: method,
        seq: seq ?? Date.now(),
        ...(pauseId !== undefined ? { pauseId } : {}),
        ...(depth !== undefined ? { depth } : {}),
      },
      payload,
    )
  }

  private handleDebugSetBreakpoint({ point, enabled }: DebuggerSetBreakpointData): void {
    if (!this.bridge) return
    this.bridge.send({ type: 'setBreakpoint', seq: Date.now(), point, enabled })
  }

  private handleDebugSetBreakpointsActive({ active }: DebuggerSetBreakpointsActiveData): void {
    if (!this.bridge) return
    this.bridge.send({ type: 'setBreakpointsActive', seq: Date.now(), active })
  }
}

/**
 * 将前端消息路由从 CodingService 中分离，
 * 使 CodingService 只做组件编排，不写业务逻辑。
 */

import { createLogger, readBoolean, readNumber, readObject, readString } from '@vitamin/shared'
import type { WebSocketManager } from './websocket-manager'
import type {
  WebSocketClientMessage,
  ChatQueryData,
  ChatApprovalData,
  ChatAskUserResponseData,
  ChatPlanApprovalResponseData,
  ChatReviewResponseData,
  SessionSubscribeData,
  DebuggerCommandData,
  DebuggerSetBreakpointData,
  DebuggerSetBreakpointsActiveData,
} from './types'
import type { DebugBridge } from './debug-bridge'
import type { VitaminContext } from '@vitamin/coding'
import type { PauseResumePayload } from '@vitamin/devtools'

const logger = createLogger('@vitamin/service:inbound-router')

function parseChatQuery(data: Record<string, unknown>): ChatQueryData | null {
  const message = readString(data, 'message')
  if (!message) {
    return null
  }
  return { message, sessionId: readString(data, 'sessionId') }
}

function parseChatApproval(data: Record<string, unknown>): ChatApprovalData | null {
  const approvalId = readString(data, 'approvalId')
  const approved = readBoolean(data, 'approved')
  if (!approvalId || approved === undefined) {
    return null
  }
  return { approvalId, approved, sessionId: readString(data, 'sessionId') }
}

function parseChatAskUserResponse(data: Record<string, unknown>): ChatAskUserResponseData | null {
  const requestId = readString(data, 'requestId')
  if (!requestId) {
    return null
  }
  const cancelled = data.cancelled === true
  const answers = cancelled ? null : (readObject(data, 'answers') ?? null)
  return { requestId, answers, cancelled, sessionId: readString(data, 'sessionId') }
}

function parseChatPlanApprovalResponse(
  data: Record<string, unknown>,
): ChatPlanApprovalResponseData | null {
  const requestId = readString(data, 'requestId')
  const action = readString(data, 'action')
  if (!requestId || !action) {
    return null
  }
  return {
    requestId,
    action,
    feedback: readString(data, 'feedback'),
    sessionId: readString(data, 'sessionId'),
  }
}

function parseChatReviewResponse(data: Record<string, unknown>): ChatReviewResponseData | null {
  const reviewId = readString(data, 'reviewId')
  const approved = readBoolean(data, 'approved')
  if (!reviewId || approved === undefined) {
    return null
  }
  const rawIssues = data.issues
  const issues = Array.isArray(rawIssues)
    ? rawIssues.filter((issue): issue is string => typeof issue === 'string')
    : undefined
  return {
    reviewId,
    approved,
    issues,
    sessionId: readString(data, 'sessionId'),
  }
}

function parseSessionSubscribe(data: Record<string, unknown>): SessionSubscribeData | null {
  const sessionId = readString(data, 'sessionId')
  if (!sessionId) {
    return null
  }
  return { sessionId }
}

function parseDebuggerCommand(data: Record<string, unknown>): DebuggerCommandData {
  return {
    seq: readNumber(data, 'seq'),
    pauseId: readString(data, 'pauseId'),
    depth: readNumber(data, 'depth'),
  }
}

function parseDebuggerSetBreakpoint(
  data: Record<string, unknown>,
): DebuggerSetBreakpointData | null {
  const point = readString(data, 'point')
  const enabled = readBoolean(data, 'enabled')
  if (point === undefined || enabled === undefined) {
    return null
  }
  return { point, enabled }
}

function parseDebuggerSetBreakpointsActive(
  data: Record<string, unknown>,
): DebuggerSetBreakpointsActiveData | null {
  const active = readBoolean(data, 'active')
  if (active === undefined) {
    return null
  }
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

    logger.debug({ clientId, type }, 'message from client')

    switch (type) {
      // ── Session subscription ────────────────────────────────────────────────
      case 'Session.subscribe': {
        const parsed = parseSessionSubscribe(data)
        if (parsed) {
          if (!this.vitamin.getSession(parsed.sessionId)) {
            this.ws.sendToClient(clientId, {
              type: 'Runtime.error',
              data: {
                sessionId: parsed.sessionId,
                message: `Session "${parsed.sessionId}" not found`,
              },
            })
            break
          }
          this.ws.subscribeClient(clientId, parsed.sessionId)
        }
        break
      }

      case 'Session.unsubscribe': {
        const parsed = parseSessionSubscribe(data)
        if (parsed) {
          this.ws.unsubscribeClient(clientId, parsed.sessionId)
        }
        break
      }

      // ── Chat business commands ──────────────────────────────────────────────
      case 'Chat.query': {
        const parsed = parseChatQuery(data)
        if (parsed) {
          this.handleQuery(parsed)
        }
        break
      }

      case 'Chat.approval': {
        const parsed = parseChatApproval(data)
        if (parsed) {
          this.handleApproval(parsed)
        }
        break
      }

      case 'Chat.askUserResponse': {
        const parsed = parseChatAskUserResponse(data)
        if (parsed) {
          this.handleAskUserResponse(parsed)
        }
        break
      }

      case 'Chat.planApprovalResponse': {
        const parsed = parseChatPlanApprovalResponse(data)
        if (parsed) {
          this.handlePlanApprovalResponse(parsed)
        }
        break
      }

      case 'Chat.reviewResponse': {
        const parsed = parseChatReviewResponse(data)
        if (parsed) {
          this.handleReviewResponse(parsed)
        }
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
        if (parsed) {
          this.handleDebugSetBreakpoint(parsed)
        }
        break
      }

      case 'Debugger.setBreakpointsActive': {
        const parsed = parseDebuggerSetBreakpointsActive(data)
        if (parsed) {
          this.handleDebugSetBreakpointsActive(parsed)
        }
        break
      }

      default:
        logger.debug({ type }, 'unknown client message type')
    }
  }

  private resolveSession(sessionId?: string) {
    return sessionId ? this.vitamin.getSession(sessionId) : this.vitamin.getActiveSession()
  }

  private handleQuery({ message, sessionId }: ChatQueryData): void {
    const session = this.resolveSession(sessionId)
    if (!session) {
      return
    }

    session.prompt(message).catch((err: Error) => {
      this.ws.sendToSession(session.id, {
        type: 'Runtime.error',
        data: { sessionId: session.id, message: err.message },
      })
    })
  }

  private handleApproval({ approvalId, approved, sessionId }: ChatApprovalData): void {
    const session = this.resolveSession(sessionId)
    if (!session) {
      return
    }

    session.resolveApproval(approvalId, approved)
    logger.debug({ sessionId: session.id, approved }, 'approval resolved')
  }

  private handleAskUserResponse({ requestId, answers, sessionId }: ChatAskUserResponseData): void {
    const session = this.resolveSession(sessionId)
    if (!session) {
      return
    }

    session.resolveAskUser(requestId, answers)
    logger.debug({ sessionId: session.id, requestId }, 'ask_user resolved')
  }

  private handlePlanApprovalResponse({
    requestId,
    action,
    feedback,
    sessionId,
  }: ChatPlanApprovalResponseData): void {
    const session = this.resolveSession(sessionId)
    if (!session) {
      return
    }

    session.resolvePlanApproval(requestId, action, feedback)
    logger.debug({ sessionId: session.id, action, requestId }, 'plan approval resolved')
  }

  private handleReviewResponse({
    reviewId,
    approved,
    issues,
    sessionId,
  }: ChatReviewResponseData): void {
    const session = this.resolveSession(sessionId)
    if (!session) {
      return
    }

    session.resolvePatchReview(reviewId, approved, issues)
    logger.debug({ sessionId: session.id, reviewId, approved }, 'patch review resolved')
  }

  private handleDebugCommand(
    method: string,
    { seq, pauseId, depth }: DebuggerCommandData,
    rawData: Record<string, unknown>,
  ): void {
    if (!this.bridge) {
      return
    }

    const payload = readObject(rawData, 'payload') as PauseResumePayload | undefined

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
    if (!this.bridge) {
      return
    }
    this.bridge.send({ type: 'setBreakpoint', seq: Date.now(), point, enabled })
  }

  private handleDebugSetBreakpointsActive({ active }: DebuggerSetBreakpointsActiveData): void {
    if (!this.bridge) {
      return
    }
    this.bridge.send({ type: 'setBreakpointsActive', seq: Date.now(), active })
  }
}

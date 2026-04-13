/**
 * 将前端消息路由从 CodingService 中分离，
 * 使 CodingService 只做组件编排，不写业务逻辑。
 */

import { createLogger } from '@vitamin/shared'
import type { WebSocketManager } from './websocket-manager'
import type { WebSocketClientMessage } from './types'
import type { DebugBridge } from './debug-bridge'
import type { VitaminContext } from '@vitamin/coding'
import type { PauseResumePayload } from '@vitamin/devtools'

const logger = createLogger('@vitamin/service:inbound-router')

interface SendCommand {
  type: string
  seq: number
  depth?: number
  [extra: string]: unknown
}

export class InboundRouter {
  constructor(
    private readonly ws: WebSocketManager,
    private readonly vitamin: VitaminContext,
    private readonly bridge: DebugBridge | null,
  ) {}

  dispatch(clientId: string, message: WebSocketClientMessage): void {
    const sessionId = message.data.sessionId as string | undefined

    logger.debug(`message from client ${clientId}: ${message.type} for session ${sessionId ?? 'N/A'}`)

    switch (message.type) {
      // ── Session 订阅管理 ──────────────────────────────────────────────────────
      case 'Session.subscribe':
        this.ws.subscribeClient(clientId, message.data.sessionId as string)
        break

      case 'Session.unsubscribe':
        this.ws.unsubscribeClient(clientId, message.data.sessionId as string)
        break

      // ── Chat 业务命令 ─────────────────────────────────────────────────────────
      case 'Chat.query':
        this.handleQuery(sessionId, message.data)
        break

      case 'Chat.approval':
        this.handleApproval(sessionId, message.data)
        break

      case 'Chat.askUserResponse':
        this.handleAskUserResponse(sessionId, message.data)
        break

      case 'Chat.planApprovalResponse':
        this.handlePlanApprovalResponse(sessionId, message.data)
        break

      // ── Debugger 命令 ─────────────────────────────────────────────────────────
      case 'Debugger.resume':
      case 'Debugger.stepOver':
      case 'Debugger.stepInto':
      case 'Debugger.disable':
        this.handleDebugCommand(message.type, message.data)
        break

      case 'Debugger.setBreakpoint':
        this.handleDebugSetBreakpoint(message.data)
        break

      case 'Debugger.setBreakpointsActive':
        this.handleDebugSetBreakpointsActive(message.data)
        break

      default:
        logger.debug(`unknown client message type: ${message.type}`)
    }
  }

  private resolveSession(sessionId?: string) {
    return sessionId
      ? this.vitamin.getSession(sessionId)
      : this.vitamin.sessionManager.active
  }

  private handleQuery(sessionId: string | undefined, data: Record<string, unknown>): void {
    const session = this.resolveSession(sessionId)
    if (!session) return

    const query = data.message as string
    if (!query) return

    session.prompt(query).catch((err: Error) => {
      this.ws.sendToSession(session.id, {
        type: 'Runtime.error',
        data: { sessionId: session.id, message: err.message },
      })
    })
  }

  private handleApproval(sessionId: string | undefined, data: Record<string, unknown>): void {
    const session = this.resolveSession(sessionId)
    if (!session) return

    const approvalId = data.approvalId as string
    const approved = data.approved === true
    session.resolveApproval(approvalId, approved)
    logger.debug(`${approved ? 'approval' : 'rejection'} for session ${session.id}`)
  }

  private handleAskUserResponse(
    sessionId: string | undefined,
    data: Record<string, unknown>,
  ): void {
    const session = this.resolveSession(sessionId)
    if (!session) return

    const requestId = data.requestId as string
    const answers =
      data.cancelled === true ? null : (data.answers as Record<string, unknown>)
    session.resolveAskUser(requestId, answers)
    logger.debug(`ask_user response for session ${session.id}`)
  }

  private handlePlanApprovalResponse(
    sessionId: string | undefined,
    data: Record<string, unknown>,
  ): void {
    const session = this.resolveSession(sessionId)
    if (!session) return

    const requestId = data.requestId as string
    const action = data.action as string
    const feedback = data.feedback as string | undefined
    session.resolvePlanApproval(requestId, action, feedback)
    logger.debug(`plan ${action} for session ${session.id}`)
  }

  private handleDebugCommand(method: string, data: Record<string, unknown>): void {
    if (!this.bridge) return

    this.bridge.send(
      {
        type: method,
        seq: (data.seq as number) ?? Date.now(),
        ...(data.pauseId !== undefined ? { pauseId: data.pauseId as string } : {}),
        ...(data.depth !== undefined ? { depth: data.depth as number } : {}),
      } as SendCommand,
      data.payload as PauseResumePayload | undefined,
    )
  }

  private handleDebugSetBreakpoint(data: Record<string, unknown>): void {
    if (!this.bridge) return

    const point = data.point as string
    const enabled = data.enabled as boolean
    if (point !== undefined && enabled !== undefined) {
      this.bridge.send({ type: 'setBreakpoint', seq: Date.now(), point, enabled })
    }
  }

  private handleDebugSetBreakpointsActive(data: Record<string, unknown>): void {
    if (!this.bridge) return

    this.bridge.send({
      type: 'setBreakpointsActive',
      seq: Date.now(),
      active: data.active as boolean,
    })
  }
}

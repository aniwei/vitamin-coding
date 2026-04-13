/**
 * EventBridge
 *
 * 职责：将 AgentSession 的事件流接入 WebSocket 传输层。
 *
 * 一次 subscribe，所有事件经 routeSessionEvent() 映射后发送给订阅该 session 的 WS 客户端。
 * 事件 → WS 消息的完整映射逻辑见 session-event-router.ts。
 */

import { routeSessionEvent } from './session-event-router'
import type { WebSocketManager } from './websocket-manager'
import type { AgentSession } from '@vitamin/coding'

export class EventBridge {
  private unsubscribeSession?: () => void

  constructor(
    private readonly session: AgentSession,
    private readonly ws: WebSocketManager,
  ) {}

  attach(): void {
    this.unsubscribeSession = this.session.subscribe((event) => {
      const messages = routeSessionEvent(event)
      for (const msg of messages) {
        this.ws.sendToSession(event.sessionId, msg)
      }
    })
  }

  detach(): void {
    this.unsubscribeSession?.()
    this.unsubscribeSession = undefined
  }

  dispose(): void {
    this.detach()
  }
}

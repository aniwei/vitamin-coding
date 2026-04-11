import { WebSocketServer } from 'ws'
import { createLogger, TypedEventEmitter, type Events } from '@vitamin/shared'
import type { WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type { WebSocketMessage, WebSocketClientMessage } from './types'

const logger = createLogger('@vitamin/service:websocket-manager')

export type WebSocketClientHandler = (clientId: string, message: WebSocketClientMessage) => void

interface WebSocketManagerEvents extends Events {
  message: (clientId: string, message: WebSocketClientMessage) => void
}

export class WebSocketManager extends TypedEventEmitter<WebSocketManagerEvents> {
  private readonly wss: WebSocketServer
  private readonly clients = new Map<string, WebSocket>()
  private readonly sessionSubscriptions = new Map<string, Set<string>>()
  private clientId = 0

  get clientCount(): number {
    return this.clients.size
  }

  constructor() {
    super()
    this.wss = new WebSocketServer({ noServer: true })
    this.wss.on('connection', this.onConnection)
  }

  handleUpgrade(request: IncomingMessage, socket: Socket, head: Buffer, pathname: string): boolean {
    if (pathname !== '/ws') {
      return false
    }

    this.wss.handleUpgrade(request, socket, head, (ws) => this.wss.emit('connection', ws, request))

    return true
  }

  broadcast(message: WebSocketMessage): void {
    const payload = JSON.stringify(message)
    for (const [, ws] of this.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload)
      }
    }
  }

  sendToSession(sessionId: string, message: WebSocketMessage): void {
    const subscribers = this.sessionSubscriptions.get(sessionId)
    if (!subscribers || subscribers.size === 0) {
      this.broadcast(message)
      return
    }

    const payload = JSON.stringify(message)
    for (const clientId of subscribers) {
      const ws = this.clients.get(clientId)
      if (ws && ws.readyState === ws.OPEN) {
        ws.send(payload)
      }
    }
  }

  sendToClient(clientId: string, message: WebSocketMessage): void {
    const ws = this.clients.get(clientId)
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  close(): void {
    for (const [, ws] of this.clients) {
      ws.close()
    }
    this.clients.clear()
    this.sessionSubscriptions.clear()
    this.wss.close()
  }

  private onConnection = (ws: WebSocket) => {
    const clientId = String(++this.clientId)
    this.clients.set(clientId, ws)

    logger.debug(`client connected: ${clientId}`)
    this.sendToClient(clientId, { type: 'Runtime.connected', data: { clientId } })

    ws.on('message', (raw: Buffer) => {
      try {
        const parsed = JSON.parse(raw.toString()) as unknown
        const message = this.normalizeClientMessage(parsed)
        if (!message) {
          logger.warn(`invalid message from client ${clientId}`)
          return
        }

        if (this.handleSystemClientMessage(clientId, message)) {
          return
        }

        // Forward to handler
        this.emit('message', clientId, message)
      } catch {
        logger.warn(`invalid message from client ${clientId}`)
      }
    })

    ws.on('close', () => {
      this.clients.delete(clientId)
      // Remove from all session subscriptions
      for (const [, subscribers] of this.sessionSubscriptions) {
        subscribers.delete(clientId)
      }

      logger.debug(`client disconnected: ${clientId}`)
    })

    ws.on('error', (err) => {
      logger.warn(`client ${clientId} error: ${err.message}`)
    })
  }

  private handleSystemClientMessage(clientId: string, message: WebSocketClientMessage): boolean {
    switch (message.type) {
      case 'Runtime.ping':
        this.handleRuntimePing(clientId)
        return true
      case 'Session.subscribe':
        this.handleSessionSubscribe(clientId, message.data)
        return true
      case 'Session.unsubscribe':
        this.handleSessionUnsubscribe(clientId, message.data)
        return true
      default:
        return false
    }
  }

  private handleRuntimePing(clientId: string): void {
    this.sendToClient(clientId, {
      type: 'Runtime.pong',
      data: { timestamp: Date.now() },
    })
  }

  private handleSessionSubscribe(clientId: string, data: Record<string, unknown>): void {
    const sessionId = this.readSessionId(data)
    if (!sessionId) {
      return
    }

    if (!this.sessionSubscriptions.has(sessionId)) {
      this.sessionSubscriptions.set(sessionId, new Set())
    }

    this.sessionSubscriptions.get(sessionId)?.add(clientId)
  }

  private handleSessionUnsubscribe(clientId: string, data: Record<string, unknown>): void {
    const sessionId = this.readSessionId(data)
    if (!sessionId) {
      return
    }

    this.sessionSubscriptions.get(sessionId)?.delete(clientId)
  }

  private readSessionId(data: Record<string, unknown>): string | null {
    const sessionId = data.sessionId
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      return null
    }

    return sessionId
  }

  private normalizeClientMessage(raw: unknown): WebSocketClientMessage | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null
    }

    const value = raw as Record<string, unknown>

    if (typeof value.method === 'string') {
      const method = value.method
      const data = this.asRecord(value.params)

      if (typeof value.id === 'number') {
        if (data.seq === undefined) {
          data.seq = value.id
        }
        if (data.requestId === undefined) {
          data.requestId = value.id
        }
      }

      return {
        type: method as WebSocketClientMessage['type'],
        data,
      }
    }

    return null
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }

    return {}
  }
}

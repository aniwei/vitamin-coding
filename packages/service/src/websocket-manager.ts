import { WebSocketServer } from 'ws'
import { createLogger, TypedEventEmitter, type Events } from '@vitamin/shared'
import type { WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type { WebSocketMessage, WebSocketClientMessage } from './types'
import { validateWebSocketMessage } from './ws-protocol'

const logger = createLogger('@vitamin/service:websocket-manager')

export type WebSocketClientHandler = (clientId: string, message: WebSocketClientMessage) => void
export type SessionEventSink = (message: WebSocketMessage) => void

export interface WebSocketManagerOptions {
  heartbeatIntervalMs?: number
  authToken?: string
}

interface ManagedClient {
  ws: WebSocket
  isAlive: boolean
  connectedAt: number
  lastSeenAt: number
}

interface WebSocketManagerEvents extends Events {
  message: (clientId: string, message: WebSocketClientMessage) => void
}

export class WebSocketManager extends TypedEventEmitter<WebSocketManagerEvents> {
  private readonly wss: WebSocketServer
  private readonly clients = new Map<string, ManagedClient>()
  private readonly sessionSubscriptions = new Map<string, Set<string>>()
  private readonly sessionEventSinks = new Map<string, Set<SessionEventSink>>()
  private readonly heartbeatInterval: NodeJS.Timeout | undefined
  private readonly authToken: string | undefined
  private clientId = 0

  get clientCount(): number {
    return this.clients.size
  }

  constructor(options: WebSocketManagerOptions = {}) {
    super()
    this.wss = new WebSocketServer({ noServer: true })
    this.wss.on('connection', this.onConnection)
    this.authToken = options.authToken
    const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30000
    if (heartbeatIntervalMs > 0) {
      this.heartbeatInterval = setInterval(() => this.checkHeartbeats(), heartbeatIntervalMs)
    }
  }

  handleUpgrade(request: IncomingMessage, socket: Socket, head: Buffer, pathname: string): boolean {
    if (pathname !== '/ws') {
      return false
    }

    if (!this.isAuthorized(request)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return true
    }

    this.wss.handleUpgrade(request, socket, head, (ws) => this.wss.emit('connection', ws, request))

    return true
  }

  broadcast(message: WebSocketMessage): void {
    if (!this.canSend(message)) {
      return
    }
    const payload = JSON.stringify(message)
    for (const [, { ws }] of this.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload)
      }
    }
  }

  sendToSession(sessionId: string, message: WebSocketMessage): void {
    if (!this.canSend(message)) {
      return
    }
    const subscribers = this.sessionSubscriptions.get(sessionId)
    const sinks = this.sessionEventSinks.get(sessionId)
    if ((!subscribers || subscribers.size === 0) && (!sinks || sinks.size === 0)) {
      return
    }

    const payload = JSON.stringify(message)
    for (const sink of sinks ?? []) {
      sink(message)
    }

    for (const clientId of subscribers ?? []) {
      const client = this.clients.get(clientId)
      const ws = client?.ws
      if (ws && ws.readyState === ws.OPEN) {
        ws.send(payload)
      }
    }
  }

  subscribeClient(clientId: string, sessionId: string): void {
    if (!sessionId) {
      return
    }
    if (!this.sessionSubscriptions.has(sessionId)) {
      this.sessionSubscriptions.set(sessionId, new Set())
    }
    this.sessionSubscriptions.get(sessionId)?.add(clientId)
  }

  unsubscribeClient(clientId: string, sessionId: string): void {
    if (!sessionId) {
      return
    }
    this.sessionSubscriptions.get(sessionId)?.delete(clientId)
  }

  subscribeSessionEvents(sessionId: string, sink: SessionEventSink): () => void {
    if (!this.sessionEventSinks.has(sessionId)) {
      this.sessionEventSinks.set(sessionId, new Set())
    }
    this.sessionEventSinks.get(sessionId)?.add(sink)

    return () => {
      const sinks = this.sessionEventSinks.get(sessionId)
      sinks?.delete(sink)
      if (sinks?.size === 0) {
        this.sessionEventSinks.delete(sessionId)
      }
    }
  }

  sendToClient(clientId: string, message: WebSocketMessage): void {
    if (!this.canSend(message)) {
      return
    }
    const ws = this.clients.get(clientId)?.ws
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }
    for (const [, client] of this.clients) {
      client.ws.close()
    }
    this.clients.clear()
    this.sessionSubscriptions.clear()
    this.sessionEventSinks.clear()
    this.wss.close()
  }

  private onConnection = (ws: WebSocket) => {
    const clientId = String(++this.clientId)
    const now = Date.now()
    this.clients.set(clientId, { ws, isAlive: true, connectedAt: now, lastSeenAt: now })

    logger.debug({ clientId }, 'client connected')
    this.sendToClient(clientId, { type: 'Runtime.connected', data: { clientId } })
    this.sendToClient(clientId, {
      type: 'Runtime.connectionState',
      data: { clientId, status: 'connected', timestamp: new Date(now).toISOString() },
    })

    ws.on('pong', () => {
      const client = this.clients.get(clientId)
      if (client) {
        client.isAlive = true
        client.lastSeenAt = Date.now()
      }
    })

    ws.on('message', (raw: Buffer) => {
      try {
        const parsed = JSON.parse(raw.toString()) as unknown
        const message = this.normalizeClientMessage(parsed)
        if (!message) {
          logger.warn({ clientId }, 'invalid message')
          return
        }
        const client = this.clients.get(clientId)
        if (client) {
          client.isAlive = true
          client.lastSeenAt = Date.now()
        }

        if (this.handleSystemClientMessage(clientId, message)) {
          return
        }

        this.emit('message', clientId, message)
      } catch {
        logger.warn({ clientId }, 'invalid message')
      }
    })

    ws.on('close', () => {
      this.removeClient(clientId)
      logger.debug({ clientId }, 'client disconnected')
    })

    ws.on('error', (err) => {
      logger.warn({ clientId, err: err.message }, 'client error')
    })
  }

  private handleSystemClientMessage(clientId: string, message: WebSocketClientMessage): boolean {
    switch (message.type) {
      case 'Runtime.ping':
        this.handleRuntimePing(clientId)
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

  private canSend(message: WebSocketMessage): boolean {
    const validation = validateWebSocketMessage(message)
    if (!validation.valid) {
      logger.warn(
        { reason: validation.reason, type: (message as { type?: string }).type },
        'invalid outbound websocket message',
      )
      return false
    }
    return true
  }

  private isAuthorized(request: IncomingMessage): boolean {
    if (!this.authToken) {
      return true
    }

    const header = request.headers.authorization
    if (typeof header === 'string' && header === `Bearer ${this.authToken}`) {
      return true
    }

    const url = new URL(request.url ?? '/', 'http://localhost')
    return url.searchParams.get('token') === this.authToken
  }

  private checkHeartbeats(): void {
    for (const [clientId, client] of this.clients) {
      if (!client.isAlive) {
        logger.warn({ clientId }, 'terminating stale websocket client')
        client.ws.terminate()
        this.removeClient(clientId)
        continue
      }

      client.isAlive = false
      client.ws.ping()
    }
  }

  private removeClient(clientId: string): void {
    this.clients.delete(clientId)
    for (const [sessionId, subscribers] of this.sessionSubscriptions) {
      subscribers.delete(clientId)
      if (subscribers.size === 0) {
        this.sessionSubscriptions.delete(sessionId)
      }
    }
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

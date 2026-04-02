import { WebSocketServer } from 'ws'
import { createLogger } from '@vitamin/shared'
import type { WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type { WebSocketMessage, WebSocketClientMessage } from './types'

const logger = createLogger('@vitamin/service:ws-manager')

export type WSClientHandler = (
  clientId: string,
  message: WebSocketClientMessage,
) => void

export class WebSocketManager {
  private readonly wss: WebSocketServer
  private readonly clients = new Map<string, WebSocket>()
  private readonly sessionSubscriptions = new Map<string, Set<string>>() // sessionId → clientIds
  private nextClientId = 0
  private clientHandler: WSClientHandler | null = null

  constructor() {
    this.wss = new WebSocketServer({ noServer: true })
    this.wss.on('connection', this.handleConnection)
  }

  /** Call from parent HTTP server's 'upgrade' event */
  handleUpgrade(
    request: IncomingMessage,
    socket: Socket,
    head: Buffer,
    pathname: string,
  ): boolean {
    if (pathname !== '/ws') {
      return false
    }

    this.wss.handleUpgrade(request, socket, head, (ws) => this.wss.emit('connection', ws, request))
    
    return true
  }

  /** Register handler for incoming client messages */
  onClientMessage(handler: WSClientHandler): void {
    this.clientHandler = handler
  }

  /** Broadcast to all connected clients */
  broadcast(message: WebSocketMessage): void {
    const payload = JSON.stringify(message)
    for (const [, ws] of this.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload)
      }
    }
  }

  /** Send to clients subscribed to a specific session */
  sendToSession(sessionId: string, message: WebSocketMessage): void {
    const subscribers = this.sessionSubscriptions.get(sessionId)
    if (!subscribers || subscribers.size === 0) {
      // Fall back to broadcast if no explicit subscriptions
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

  /** Send to a specific client */
  sendToClient(clientId: string, message: WebSocketMessage): void {
    const ws = this.clients.get(clientId)
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  get clientCount(): number {
    return this.clients.size
  }

  close(): void {
    for (const [, ws] of this.clients) {
      ws.close()
    }
    this.clients.clear()
    this.sessionSubscriptions.clear()
    this.wss.close()
  }

  private handleConnection = (ws: WebSocket) => {
    const clientId = String(++this.nextClientId)
    this.clients.set(clientId, ws)

    logger.debug(`client connected: ${clientId}`)
    this.sendToClient(clientId, { type: 'connected', data: { clientId } })

    ws.on('message', (raw: Buffer) => {
      try {
        const message = JSON.parse(raw.toString()) as WebSocketClientMessage

        // Handle ping internally
        if (message.type === 'ping') {
          this.sendToClient(clientId, {
            type: 'pong',
            data: { timestamp: Date.now() },
          })
          return
        }

        // Handle session subscriptions
        if (message.type === 'subscribe_session') {
          const sessionId = message.data.sessionId as string
          if (sessionId) {
            if (!this.sessionSubscriptions.has(sessionId)) {
              this.sessionSubscriptions.set(sessionId, new Set())
            }
            this.sessionSubscriptions.get(sessionId)!.add(clientId)
          }
          return
        }

        if (message.type === 'unsubscribe_session') {
          const sessionId = message.data.sessionId as string
          if (sessionId) {
            this.sessionSubscriptions.get(sessionId)?.delete(clientId)
          }
          return
        }

        // Forward to handler
        this.clientHandler?.(clientId, message)
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
}

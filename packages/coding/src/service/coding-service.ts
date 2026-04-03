import { createServer, type Server } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createLogger } from '@vitamin/shared'
import { WebSocketManager } from './ws-manager'
import { EventBridge } from './event-bridge'
import { createHealthRoute } from './routes/health'
import { createChatRoute } from './routes/chat'
import { createSessionsRoute } from './routes/sessions'
import { createConfigRoute } from './routes/config'
import type { VitaminContext } from '../types'
import type { AgentSession } from '../session/agent-session'
import type { CodingServiceOptions } from './types'
import type { Socket } from 'node:net'

const logger = createLogger('@vitamin/coding:service')

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}

/**
 * HTTP + WebSocket service that bridges VitaminApp ↔ web-ui.
 *
 * Architecture:
 *   - Hono-based REST API on `/api/*` (matching web-ui client.ts expectations)
 *   - WebSocket on `/ws` (matching web-ui websocket.ts expectations)
 *   - Optional static file serving for web-ui production build
 *   - Optional devtools route mounting via `mountDevtools()`
 *
 * Usage:
 *   const vitamin = createVitamin({ ... })
 *   await vitamin.start()
 *   const service = createCodingService(vitamin, { port: 8080 })
 *   await service.start()
 */
export class CodingService {
  private readonly app: Hono
  private readonly ws: WebSocketManager
  private readonly server: Server
  private readonly bridges = new Map<string, EventBridge>()
  private readonly host: string
  private readonly port: number
  private readonly staticDir?: string
  private started = false

  constructor(
    private readonly ctx: VitaminContext,
    options: CodingServiceOptions,
  ) {
    this.host = options.host ?? '127.0.0.1'
    this.port = options.port
    this.staticDir = options.staticDir

    this.ws = new WebSocketManager()
    this.app = this.createApp(options.corsOrigin)
    this.server = createServer()

    // Wire HTTP → Hono
    this.server.on('request', this.app.fetch)

    // Wire WebSocket upgrades
    this.server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', `http://${this.host}:${this.port}`)
      const handled = this.ws.handleUpgrade(req, socket as Socket, head as Buffer, url.pathname)
      if (!handled) {
        // If devtools or other services are mounted, they could handle it here.
        // For now, destroy unrecognized upgrades.
        (socket as Socket).destroy()
      }
    })

    // Handle incoming WS client messages (approve, reject, etc.)
    this.ws.onClientMessage((clientId, message) => {
      this.handleClientMessage(clientId, message)
    })
  }

  /** Get the underlying HTTP server */
  get httpServer(): Server {
    return this.server
  }

  /** Get the WebSocket manager (for external event injection) */
  get wsManager(): WebSocketManager {
    return this.ws
  }

  /** Start listening */
  async start(): Promise<void> {
    if (this.started) return

    return new Promise<void>((resolve, reject) => {
      this.server.listen(this.port, this.host, () => {
        this.started = true
        logger.info(`service started on http://${this.host}:${this.port}`)
        resolve()
      })
      this.server.on('error', reject)
    })
  }

  /** Stop the server */
  async stop(): Promise<void> {
    if (!this.started) return

    // Detach all bridges
    for (const [, bridge] of this.bridges) {
      bridge.detach()
    }
    this.bridges.clear()

    this.ws.close()

    return new Promise<void>((resolve) => {
      this.server.close(() => {
        this.started = false
        logger.info('service stopped')
        resolve()
      })
    })
  }

  /**
   * Attach event bridge for a session.
   * Call this after creating an AgentSession to enable real-time WS streaming.
   */
  attachSession(session: AgentSession): void {
    if (this.bridges.has(session.id)) return

    const bridge = new EventBridge(session, this.ws)
    bridge.attach()
    this.bridges.set(session.id, bridge)

    // Notify all WS clients about new session activity
    this.ws.broadcast({
      type: 'session_activity',
      data: {
        sessionId: session.id,
        action: 'created',
        timestamp: new Date().toISOString(),
      },
    })
  }

  /** Detach event bridge when session is removed */
  detachSession(sessionId: string): void {
    const bridge = this.bridges.get(sessionId)
    if (bridge) {
      bridge.detach()
      this.bridges.delete(sessionId)
    }
  }

  /**
   * Mount additional Hono routes (e.g., devtools debug routes).
   * Must be called before start().
   *
   * Example:
   *   service.mount('/devtools', devtoolsApp)
   */
  mount(path: string, app: Hono): void {
    this.app.route(path, app)
  }

  private createApp(corsOrigin?: string): Hono {
    const app = new Hono()

    // CORS for dev mode
    if (corsOrigin) {
      app.use(
        '/api/*',
        cors({
          origin: corsOrigin,
          allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowHeaders: ['Content-Type', 'Authorization'],
        }),
      )
    }

    // API routes — matching web-ui client.ts endpoints
    app.route('/api/health', createHealthRoute(this.ctx))
    app.route('/api/chat', createChatRoute(this.ctx, this.ws, this.bridges))
    app.route('/api/sessions', createSessionsRoute(this.ctx, this.ws, this.bridges))
    app.route('/api/config', createConfigRoute(this.ctx))

    // Static file serving for production web-ui build
    if (this.staticDir) {
      app.get('*', (c) => {
        return this.serveStatic(c)
      })
    }

    return app
  }

  private serveStatic(c: any) {
    if (!this.staticDir) {
      return c.text('not found', 404)
    }

    let filePath = c.req.path
    if (filePath === '/' || !filePath.includes('.')) {
      filePath = '/index.html'
    }

    const fullPath = join(this.staticDir, filePath)

    // Prevent path traversal
    if (!fullPath.startsWith(this.staticDir)) {
      return c.text('forbidden', 403)
    }

    if (!existsSync(fullPath)) {
      // SPA fallback: serve index.html for non-asset routes
      const indexPath = join(this.staticDir, 'index.html')
      if (existsSync(indexPath)) {
        const content = readFileSync(indexPath)
        return new Response(content, {
          headers: { 'Content-Type': 'text/html' },
        })
      }
      return c.text('not found', 404)
    }

    const ext = extname(fullPath)
    const mime = MIME_TYPES[ext] || 'application/octet-stream'
    const content = readFileSync(fullPath)
    return new Response(content, {
      headers: { 'Content-Type': mime },
    })
  }

  private handleClientMessage(
    clientId: string,
    message: { type: string; data: Record<string, unknown> },
  ): void {
    const sessionId = message.data.sessionId as string | undefined

    switch (message.type) {
      case 'approve': {
        // Tool approval — forward to the hook system
        logger.debug(`approval from client ${clientId} for session ${sessionId}`)
        break
      }
      case 'reject': {
        logger.debug(`rejection from client ${clientId} for session ${sessionId}`)
        break
      }
      case 'ask_user_response': {
        logger.debug(`ask_user response from client ${clientId}`)
        break
      }
      case 'plan_approve':
      case 'plan_reject': {
        logger.debug(`plan ${message.type} from client ${clientId}`)
        break
      }
      default:
        logger.debug(`unknown client message type: ${message.type}`)
    }
  }
}

/** Factory function */
export function createCodingService(
  ctx: VitaminContext,
  options: CodingServiceOptions,
): CodingService {
  return new CodingService(ctx, options)
}

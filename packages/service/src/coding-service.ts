import { createServer, type Server } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { Hono } from 'hono'
import { createLogger } from '@vitamin/shared'
import { WebSocketManager } from './websocket-manager'
import { EventBridge } from './event-bridge'
import { DebugBridge } from './debug-bridge'
import { createApp } from './create-app'
import type { CodingServiceOptions } from './types'
import type { Socket } from 'node:net'
import type { VitaminContext, AgentSession } from '@vitamin/coding'


const logger = createLogger('@vitamin/service')

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

export class CodingService {
  private readonly app: Hono
  private readonly server: Server
  private readonly bridges = new Map<string, EventBridge>()
  private readonly host: string
  private readonly port: number
  private readonly staticDir?: string
  private readonly debugBridge: DebugBridge | null = null
  private started = false
  
  public readonly ws: WebSocketManager

  constructor(
    public readonly vitamin: VitaminContext,
    options: CodingServiceOptions,
  ) {
    this.host = options.host ?? '127.0.0.1'
    this.port = options.port
    this.staticDir = options.staticDir

    this.ws = new WebSocketManager()

    if (options.devtools) {
      this.debugBridge = new DebugBridge(options.devtools, this.ws)
    }

    this.app = createApp(this, { 
      cors: options.cors, 
      devtools: options.devtools, 
      staticDir: options.staticDir,
      debugBridge: this.debugBridge,
    })

    this.server = createServer()

    this.server.on('request', this.app.fetch)
    this.server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', `http://${this.host}:${this.port}`)
      const handled = this.ws.handleUpgrade(req, socket as Socket, head as Buffer, url.pathname)
      if (!handled) {
        ;(socket as Socket).destroy()
      }
    })

    this.ws.onClientMessage((clientId, message) => {
      this.handleClientMessage(clientId, message)
    })
  }

  get httpServer(): Server {
    return this.server
  }

  async start(): Promise<void> {
    if (this.started) return

    return new Promise<void>((resolve, reject) => {
      this.server.listen(this.port, this.host, () => {
        this.started = true
        this.debugBridge?.attach()
        logger.info(`service started on http://${this.host}:${this.port}`)
        resolve()
      })

      this.server.on('error', reject)
    })
  }

  async stop(): Promise<void> {
    if (!this.started) return

    this.debugBridge?.detach()

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

  attachSession(session: AgentSession): void {
    if (this.bridges.has(session.id)) return

    const bridge = new EventBridge(session, this.ws)
    bridge.attach()
    this.bridges.set(session.id, bridge)

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
   */
  mount(path: string, routeApp: Hono): void {
    this.app.route(path, routeApp)
  }

  serveStaticFile(c: any) {
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
      case 'approve':
        logger.debug(`approval from client ${clientId} for session ${sessionId}`)
        break
      case 'reject':
        logger.debug(`rejection from client ${clientId} for session ${sessionId}`)
        break
      case 'ask_user_response':
        logger.debug(`ask_user response from client ${clientId}`)
        break
      case 'plan_approve':
      case 'plan_reject':
        logger.debug(`plan ${message.type} from client ${clientId}`)
        break
      case 'debug_command':
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

  private handleDebugCommand(method: string, data: Record<string, unknown>): void {
    if (!this.debugBridge) return

    // Map CDP-style method names to command types
    const methodToType: Record<string, string> = {
      'Debugger.resume': 'continue',
      'Debugger.stepOver': 'next',
      'Debugger.stepInto': 'step',
      'Debugger.disable': 'stop',
      'debug_command': data.type as string, // legacy
    }

    const type = methodToType[method] ?? (data.type as string)
    if (!type) return

    this.debugBridge.sendCommand(
      {
        type,
        seq: (data.seq as number) ?? Date.now(),
        ...(data.depth !== undefined ? { depth: data.depth as number } : {}),
      },
      data.payload as Record<string, unknown> | undefined,
    )
  }

  private handleDebugSetBreakpoint(data: Record<string, unknown>): void {
    // Forward breakpoint changes via the bridge
    if (!this.debugBridge) return
    // Forward as REST-equivalent via WS
    const point = data.point as string
    const enabled = data.enabled as boolean
    if (point !== undefined && enabled !== undefined) {
      this.debugBridge.sendCommand({
        type: 'setBreakpoint',
        seq: Date.now(),
        point,
        enabled,
      } as any)
    }
  }

  private handleDebugSetBreakpointsActive(data: Record<string, unknown>): void {
    if (!this.debugBridge) return
    this.debugBridge.sendCommand({
      type: 'setBreakpointsActive',
      seq: Date.now(),
      active: data.active as boolean,
    } as any)
  }
}

/** Factory function */
export function createCodingService(
  ctx: VitaminContext,
  options: CodingServiceOptions,
): CodingService {
  return new CodingService(ctx, options)
}


import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { Hono } from 'hono'
import { createAdaptorServer } from '@hono/node-server'
import { createLogger } from '@vitamin/shared'
import { WebSocketManager } from './websocket-manager'
import { EventBridge } from './event-bridge'
import { DebugBridge } from './debug-bridge'
import { createApp } from './create-app'
import { type IncomingMessage, type Server } from 'node:http'
import type { CodingServiceOptions } from './types'
import type { Socket } from 'node:net'
import type { AgentSession, VitaminContext } from '@vitamin/coding'


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
  private readonly host: string
  private readonly port: number
  private readonly staticDir?: string
  private readonly bridges = new Map<string, EventBridge>()
  private started = false
  
  public readonly bridge: DebugBridge | null = null
  public readonly ws: WebSocketManager

  get httpServer(): Server {
    return this.server
  }

  constructor(
    public readonly vitamin: VitaminContext,
    options: CodingServiceOptions,
  ) {
    this.host = options.host ?? '127.0.0.1'
    this.port = options.port
    this.staticDir = options.staticDir

    this.ws = new WebSocketManager()

    if (vitamin.devtools) {
      this.bridge = new DebugBridge(vitamin.devtools, this.ws)
    }

    this.app = createApp(this, { 
      corsOrigin: options.cors, 
      devtools: vitamin.devtools ?? undefined, 
      staticDir: options.staticDir,
      debug: this.bridge,
    })

    this.server = createAdaptorServer({
      fetch: this.app.fetch,
    }) as Server

    this.ws.on('message', this.onMessage)
    this.server.on('upgrade', this.onUpgrade)

     this.registerHooks(this.vitamin)
  }

  registerHooks(vitamin: VitaminContext): void {
    vitamin.hookRegistry.register({
      name: 'service_session_attach',
      timing: 'session.created',
      priority: 5,
      enabled: true,
      handle: ({ sessionId }) => {
        const session = this.getSession(sessionId)
        if (session) {
          this.attachSession(session)
        }
      },
    })
  }

  unregisterHooks(vitamin: VitaminContext): void {
    vitamin.hookRegistry.unregister('service_session_attach')
  }

  getSession(sessionId: string): AgentSession | undefined {
    return this.vitamin.getSession(sessionId)
  }

  getActiveSession(): AgentSession | undefined {
    return this.vitamin.sessionManager.active
  }

  onUpgrade = (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = new URL(req.url ?? '/', `http://${this.host}:${this.port}`)
    const handled = this.ws.handleUpgrade(
      req, 
      socket, 
      head, 
      url.pathname
    )

    if (!handled) {
      socket.destroy()
    }
  }

  async start(): Promise<void> {
    if (this.started) return

    return new Promise<void>((resolve, reject) => {
      this.server.listen(this.port, this.host, () => {
        this.started = true
        this.bridge?.attach()
        logger.info(`service started on http://${this.host}:${this.port}`)
        resolve()
      })

      this.server.on('error', reject)
    })
  }

  dispose(): void {
    this.unregisterHooks(this.vitamin)
    this.bridge?.dispose()
    for (const [, bridge] of this.bridges) {
      bridge.dispose()
    }

    this.bridges.clear()
    logger.info('service disposed')
  }

  async stop(): Promise<void> {
    if (!this.started) return

    this.bridge?.detach()

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
      type: 'Session.activity',
      data: {
        action: 'created',
        sessionId: session.id,
        timestamp: new Date().toISOString(),
      },
    })
  }

  detachSession(sessionId: string): void {
    const bridge = this.bridges.get(sessionId)
    if (bridge) {
      bridge.detach()
      this.bridges.delete(sessionId)
    }
  }

  mount(path: string, routeApp: Hono): void {
    this.app.route(path, routeApp)
  }

  static(c: any) {
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

  private onMessage = (
    clientId: string,
    message: { type: string; data: Record<string, unknown> },
  ) => {
    const sessionId = message.data.sessionId as string | undefined

    logger.debug(`message from client ${clientId}: ${message.type} for session ${sessionId ?? 'N/A'}`)

    switch (message.type) {
      case 'Chat.query': {
        // Forward to devtools for monitoring
        this.bridge?.send({
          type: 'Chat.query',
          seq: (message.data.seq as number) ?? Date.now(),
          query: message.data.query as string,
        })

        // Route to session for actual execution
        const querySession = sessionId
          ? this.getSession(sessionId)
          : this.getActiveSession()

        if (querySession) {
          const query = message.data.message as string
          if (query) {
            querySession.prompt(query).catch((err) => {
              this.ws.broadcast({
                type: 'Runtime.error',
                data: { sessionId: querySession.id, message: err.message },
              })
            })
          }
        }
        break
      }
      case 'Chat.approval': {
        const approvalSession = sessionId
          ? this.getSession(sessionId)
          : this.getActiveSession()

        if (approvalSession) {
          const approvalId = message.data.approvalId as string
          const approved = message.data.approved === true
          approvalSession.resolveApproval(approvalId, approved)
          logger.debug(`${approved ? 'approval' : 'rejection'} from client ${clientId} for session ${sessionId}`)
        }
        break
      }
      case 'Chat.askUserResponse': {
        const askSession = sessionId
          ? this.getSession(sessionId)
          : this.getActiveSession()

        if (askSession) {
          const requestId = message.data.requestId as string
          const answers = message.data.cancelled === true
            ? null
            : (message.data.answers as Record<string, unknown>)
          askSession.resolveAskUser(requestId, answers)
          logger.debug(`ask_user response from client ${clientId} for session ${sessionId}`)
        }

        break
      }
      case 'Chat.planApprovalResponse': {
        const planSession = sessionId
          ? this.getSession(sessionId)
          : this.getActiveSession()

        if (planSession) {
          const requestId = message.data.requestId as string
          const action = message.data.action as string
          const feedback = message.data.feedback as string | undefined
          planSession.resolvePlanApproval(requestId, action, feedback)
          logger.debug(`plan ${action} from client ${clientId} for session ${sessionId}`)
        }
        break
      }
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

  private handleDebugCommand(
    method: string, 
    data: Record<string, unknown>
  ): void {
    if (!this.bridge) return

    this.bridge.send({
      type: method,
      seq: (data.seq as number) ?? Date.now(),
      ...(data.pauseId !== undefined ? { pauseId: data.pauseId as string } : {}),
      ...(data.depth !== undefined ? { depth: data.depth as number } : {}),
    }, data.payload as Record<string, unknown> | undefined)
  }

  private handleDebugSetBreakpoint(data: Record<string, unknown>): void {
    if (!this.bridge) return

    const point = data.point as string
    const enabled = data.enabled as boolean
    if (point !== undefined && enabled !== undefined) {
      this.bridge.send({
        type: 'setBreakpoint',
        seq: Date.now(),
        point,
        enabled,
      })
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

export function createCodingService(
  context: VitaminContext,
  options: CodingServiceOptions,
): CodingService {
  return new CodingService(context, options)
}

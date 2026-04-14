import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { Hono, type Context } from 'hono'
import { createAdaptorServer } from '@hono/node-server'
import { createLogger } from '@vitamin/shared'
import { WebSocketManager } from './websocket-manager'
import { EventBridge } from './event-bridge'
import { DebugBridge } from './debug-bridge'
import { InboundRouter } from './inbound-router'
import { createApp } from './create-app'
import { type IncomingMessage, type Server } from 'node:http'
import type { CodingServiceOptions, WebSocketClientMessage } from './types'
import type { Socket } from 'node:net'
import type { AgentSession, VitaminContext } from '@vitamin/coding'
import { defineHook } from '@vitamin/hooks'

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
  private readonly router: InboundRouter
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

    // 只创建对象，不注册任何监听器
    // 监听器集中在 start() 中注册，使"系统何时开始工作"一目了然
    this.ws = new WebSocketManager()

    if (vitamin.devtools) {
      this.bridge = new DebugBridge(vitamin.devtools, this.ws)
    }

    this.router = new InboundRouter(this.ws, this.vitamin, this.bridge)

    this.app = createApp(this, {
      corsOrigin: options.cors,
      devtools: vitamin.devtools ?? undefined,
      staticDir: options.staticDir,
      debug: this.bridge,
    })

    this.server = createAdaptorServer({
      fetch: this.app.fetch,
    }) as Server
  }

  registerHooks(vitamin: VitaminContext): void {
    vitamin.hookRegistry.register(
      defineHook({
        name: 'service_session_attach',
        timing: 'session.created',
        priority: 5,
        handle: ({ sessionId }) => {
          const session = this.getSession(sessionId)
          if (session) {
            this.attachSession(session)
          }
        },
      }),
    )
  }

  unregisterHooks(vitamin: VitaminContext): void {
    vitamin.hookRegistry.unregister('service_session_attach')
  }

  getSession(sessionId: string): AgentSession | undefined {
    return this.vitamin.getSession(sessionId)
  }

  getActiveSession(): AgentSession | undefined {
    return this.vitamin.getActiveSession()
  }

  private readonly onUpgrade = (req: IncomingMessage, socket: Socket, head: Buffer): void => {
    const url = new URL(req.url ?? '/', `http://${this.host}:${this.port}`)
    const handled = this.ws.handleUpgrade(req, socket, head, url.pathname)

    if (!handled) {
      socket.destroy()
    }
  }

  private readonly onWsMessage = (clientId: string, message: WebSocketClientMessage): void => {
    this.router.dispatch(clientId, message)
  }

  async start(): Promise<void> {
    if (this.started) return

    this.server.on('upgrade', this.onUpgrade)
    this.ws.on('message', this.onWsMessage)
    this.registerHooks(this.vitamin)

    // 端口就绪后才连接 devtools，避免事件在桥接建立前丢失
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

    // 与 start() 顺序相反，确保拆除干净
    this.bridge?.detach()

    for (const [, bridge] of this.bridges) {
      bridge.detach()
    }
    this.bridges.clear()

    this.ws.off('message', this.onWsMessage)
    this.unregisterHooks(this.vitamin)
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

  static(c: Context): Response {
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
}

export function createCodingService(
  context: VitaminContext,
  options: CodingServiceOptions,
): CodingService {
  return new CodingService(context, options)
}

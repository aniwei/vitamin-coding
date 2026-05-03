import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { Hono, type Context } from 'hono'
import { createAdaptorServer } from '@hono/node-server'
import { createLogger } from '@x-mars/shared'
import { WebSocketManager } from './websocket-manager'
import { EventBridge } from './event-bridge'
import { DebugBridge } from './debug-bridge'
import { InboundRouter } from './inbound-router'
import { createApp } from './create-app'
import { routeTaskEvent } from './task-event-router'
import { type IncomingMessage, type Server } from 'node:http'
import type { CodingServiceOptions, WebSocketClientMessage, WebSocketMessage } from './types'
import type { Socket } from 'node:net'
import type { AgentSession, XMarsContext } from '@x-mars/coding'
import { defineHook } from '@x-mars/hooks'

const logger = createLogger('@x-mars/service')

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

interface SchedulerRuntime {
  tick(input?: { now?: number }): Promise<unknown>
}

interface GatewaySetting {
  enabled?: unknown
  webhookSecret?: unknown
  webhook_secret?: unknown
  deliveryUrl?: unknown
  delivery_url?: unknown
  deliverySecret?: unknown
  delivery_secret?: unknown
  deliverySigningSecret?: unknown
  delivery_signing_secret?: unknown
  deliveryRetries?: unknown
  delivery_retries?: unknown
}

export class CodingService {
  private readonly app: Hono
  private readonly server: Server
  private readonly host: string
  private readonly port: number
  private readonly staticDir?: string
  private readonly schedulerEnabled: boolean
  private readonly schedulerTickIntervalMs: number
  private readonly schedulerTickOnStart: boolean
  private readonly bridges = new Map<string, EventBridge>()
  private readonly router: InboundRouter
  private schedulerInterval: ReturnType<typeof setInterval> | null = null
  private schedulerTickRunning = false
  private started = false

  public readonly bridge: DebugBridge | null = null
  public readonly ws: WebSocketManager

  get httpServer(): Server {
    return this.server
  }

  constructor(
    public readonly xMars: XMarsContext,
    options: CodingServiceOptions,
  ) {
    this.host = options.host ?? '127.0.0.1'
    this.port = options.port
    this.staticDir = options.staticDir
    this.schedulerEnabled = options.scheduler?.enabled ?? true
    this.schedulerTickIntervalMs = Math.max(1000, options.scheduler?.tickIntervalMs ?? 60_000)
    this.schedulerTickOnStart = options.scheduler?.tickOnStart ?? true

    // 只创建对象，不注册任何监听器
    // 监听器集中在 start() 中注册，使"系统何时开始工作"一目了然
    this.ws = new WebSocketManager({ authToken: options.websocketAuthToken })

    if (xMars.devtools) {
      this.bridge = new DebugBridge(xMars.devtools, this.ws)
    }

    this.router = new InboundRouter(this.ws, this.xMars, this.bridge)

    const gateway = resolveGatewayOptions(xMars, options)

    this.app = createApp(this, {
      corsOrigin: options.cors,
      devtools: xMars.devtools ?? undefined,
      staticDir: options.staticDir,
      debug: this.bridge,
      gateway,
    })

    this.server = createAdaptorServer({
      fetch: this.app.fetch,
    }) as Server
  }

  registerHooks(xMars: XMarsContext): void {
    xMars.hookRegistry.registerAll([
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
      defineHook({
        name: 'service_task_created',
        timing: 'task.created',
        priority: 5,
        handle: (payload) => {
          for (const message of routeTaskEvent({ timing: 'task.created', payload })) {
            this.sendTaskMessage(message)
          }
        },
      }),
      defineHook({
        name: 'service_task_started',
        timing: 'task.started',
        priority: 5,
        handle: (payload) => {
          for (const message of routeTaskEvent({ timing: 'task.started', payload })) {
            this.sendTaskMessage(message)
          }
        },
      }),
      defineHook({
        name: 'service_task_completed',
        timing: 'task.completed',
        priority: 5,
        handle: (payload) => {
          for (const message of routeTaskEvent({ timing: 'task.completed', payload })) {
            this.sendTaskMessage(message)
          }
        },
      }),
      defineHook({
        name: 'service_task_failed',
        timing: 'task.failed',
        priority: 5,
        handle: (payload) => {
          for (const message of routeTaskEvent({ timing: 'task.failed', payload })) {
            this.sendTaskMessage(message)
          }
        },
      }),
      defineHook({
        name: 'service_task_cancelled',
        timing: 'task.cancelled',
        priority: 5,
        handle: (payload) => {
          for (const message of routeTaskEvent({ timing: 'task.cancelled', payload })) {
            this.sendTaskMessage(message)
          }
        },
      }),
    ])
  }

  unregisterHooks(xMars: XMarsContext): void {
    xMars.hookRegistry.unregister('service_session_attach')
    xMars.hookRegistry.unregister('service_task_created')
    xMars.hookRegistry.unregister('service_task_started')
    xMars.hookRegistry.unregister('service_task_completed')
    xMars.hookRegistry.unregister('service_task_failed')
    xMars.hookRegistry.unregister('service_task_cancelled')
  }

  getSession(sessionId: string): AgentSession | undefined {
    return this.xMars.getSession(sessionId)
  }

  getActiveSession(): AgentSession | undefined {
    return this.xMars.getActiveSession()
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

  private sendTaskMessage(message: WebSocketMessage): void {
    const sessionId =
      typeof message.data === 'object' &&
      message.data !== null &&
      'sessionId' in message.data &&
      typeof message.data.sessionId === 'string'
        ? message.data.sessionId
        : undefined
    if (sessionId) {
      this.ws.sendToSession(sessionId, message)
    }
  }

  private getSchedulerRuntime(): SchedulerRuntime | undefined {
    const maybeScheduler = (this.xMars as unknown as { scheduler?: SchedulerRuntime }).scheduler
    return typeof maybeScheduler?.tick === 'function' ? maybeScheduler : undefined
  }

  private startSchedulerDaemon(): void {
    if (!this.schedulerEnabled || this.schedulerInterval) {
      return
    }

    const scheduler = this.getSchedulerRuntime()
    if (!scheduler) {
      return
    }

    if (this.schedulerTickOnStart) {
      void this.runSchedulerTick()
    }

    this.schedulerInterval = setInterval(() => {
      void this.runSchedulerTick()
    }, this.schedulerTickIntervalMs)
    this.schedulerInterval.unref?.()
  }

  private stopSchedulerDaemon(): void {
    if (!this.schedulerInterval) {
      return
    }

    clearInterval(this.schedulerInterval)
    this.schedulerInterval = null
  }

  private async runSchedulerTick(): Promise<void> {
    if (this.schedulerTickRunning) {
      return
    }

    const scheduler = this.getSchedulerRuntime()
    if (!scheduler) {
      return
    }

    this.schedulerTickRunning = true
    try {
      await scheduler.tick()
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'scheduler tick failed',
      )
    } finally {
      this.schedulerTickRunning = false
    }
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.server.on('upgrade', this.onUpgrade)
    this.ws.on('message', this.onWsMessage)
    this.registerHooks(this.xMars)

    // 端口就绪后才连接 devtools，避免事件在桥接建立前丢失
    return new Promise<void>((resolve, reject) => {
      this.server.listen(this.port, this.host, () => {
        this.started = true
        this.bridge?.attach()
        this.startSchedulerDaemon()
        logger.info({ host: this.host, port: this.port }, 'service started')
        resolve()
      })

      this.server.on('error', reject)
    })
  }

  dispose(): void {
    this.unregisterHooks(this.xMars)
    this.bridge?.dispose()
    for (const [, bridge] of this.bridges) {
      bridge.dispose()
    }

    this.bridges.clear()
    logger.info('service disposed')
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    // 与 start() 顺序相反，确保拆除干净
    this.stopSchedulerDaemon()
    this.bridge?.detach()

    for (const [, bridge] of this.bridges) {
      bridge.detach()
    }
    this.bridges.clear()

    this.ws.off('message', this.onWsMessage)
    this.unregisterHooks(this.xMars)
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
    if (this.bridges.has(session.id)) {
      return
    }

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

    // 防止路径穿越攻击
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
  context: XMarsContext,
  options: CodingServiceOptions,
): CodingService {
  return new CodingService(context, options)
}

function resolveGatewayOptions(
  context: XMarsContext,
  options: CodingServiceOptions,
): CodingServiceOptions['gateway'] {
  const setting = readGatewaySetting(context)
  const explicit = options.gateway

  return {
    enabled: explicit?.enabled ?? readBoolean(setting?.enabled) ?? true,
    webhookSecret:
      explicit?.webhookSecret ??
      readString(setting?.webhookSecret) ??
      readString(setting?.webhook_secret),
    deliveryUrl:
      explicit?.deliveryUrl ??
      readString(setting?.deliveryUrl) ??
      readString(setting?.delivery_url),
    deliverySecret:
      explicit?.deliverySecret ??
      readString(setting?.deliverySecret) ??
      readString(setting?.delivery_secret),
    deliverySigningSecret:
      explicit?.deliverySigningSecret ??
      readString(setting?.deliverySigningSecret) ??
      readString(setting?.delivery_signing_secret),
    deliveryRetries:
      explicit?.deliveryRetries ??
      readNumber(setting?.deliveryRetries) ??
      readNumber(setting?.delivery_retries),
    deliveryFetch: explicit?.deliveryFetch,
  }
}

function readGatewaySetting(context: XMarsContext): GatewaySetting | undefined {
  const value = (
    context.settings as unknown as { get?: (key: string) => unknown } | undefined
  )?.get?.('gateway')
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as GatewaySetting)
    : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

import { URL } from 'node:url'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { parentPort, workerData } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { WebSocketServer, type WebSocket } from 'ws'
import { createLoggerRoute } from './routes'
import type { Socket } from 'node:net'

interface WorkerData {
  host: string
  port: number
  serviceId: string
}

interface PendingPause {
  kind: 'http' | 'shared'
  response?: ServerResponse
  flag?: SharedArrayBuffer
}

interface DebugCommand {
  type: string
  seq: number
}

interface BreakpointResponse {
  requestId: string
  success: boolean
  payload?: unknown
  error?: string
}

const allowedCommandTypes = new Set(['next', 'step', 'over', 'continue', 'stop'])
const workerPort = (() => {
  if (!parentPort) {
    throw new Error('service-worker requires parentPort')
  }

  return parentPort
})()

function createCommandRoutes(server: ServiceWorkerServer): Hono {
  const app = new Hono()

  app.route('/logger', createLoggerRoute())

  app.post(`/logger`, async (context) => {
    const body = await context.req.text()
    server.broadcast(body)
    return context.text('ok')
  })

  app.post(`/session`, async (context) => {
    const body = await context.req.text()
    server.broadcast(body)
    return context.text('ok')
  })

  app.post(`/debugger/command`, async (context) => {
    let parsed: unknown = null

    try {
      parsed = await context.req.json()
    } catch {
      parsed = null
    }

    return context.text('ok')
  })

  app.get(`/debugger/breakpoints`, async (context) => {
    try {
      const payload = await server.breakpoints('Debugger.breakpoints.list')
      return context.json({ breakpoints: payload })
    } catch (error) {
      return context.json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
  })

  app.post(`/debugger/breakpoints`, async (context) => {
    // TODO
    return context.text('ok')
  })

  app.notFound((context) => context.text('not found', 404))

  return app
}

export class ServiceWorkerServer {
  private readonly port: number
  private readonly host: string
  private readonly serviceId: string
  private readonly pauses: PendingPause[] = []
  private readonly clients = new Set<WebSocket>()
  private readonly pendingRequests = new Map<string, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }>()
  private readonly base: string
  private readonly server
  private readonly wss

  constructor({ serviceId, host, port }: WorkerData) {
    this.port = port
    this.host = host
    this.serviceId = serviceId
    this.base = `/${this.serviceId}`

    const app = new Hono()

    app.route(`/command/${this.base}`, createCommandRoutes(this))

    this.server = createServer()
    this.server.on('request', app.fetch)
    this.server.on('upgrade', this.handleHttpUpgrade)

    this.wss = new WebSocketServer({ noServer: true })
    this.wss.on('connection', this.handleWebSocketConnection)

    this.registerParentPortEvents()
  }

  start(): void {
    this.server.listen(this.port, this.host, () => workerPort.postMessage({ type: 'Debugger.started' }))
  }

  private registerParentPortEvents(): void {
    workerPort.on('message', (message: unknown) => {
      if (!message || typeof message !== 'object') {
        return
      }

      const msg = message as Record<string, unknown>

      switch (msg.type) {
        case 'Debugger.breakpoints.response':
          this.handleBreakpointResponse(msg)
        break
      case 'broadcast':
      case 'logger':
      case 'session':
        this.handleBroadcastMessage(msg)
        break
      case 'paused':
        this.handlePausedMessage(msg)
        break
      case 'stop':
        this.handleStopMessage()
        break
      default:
        break
      }
    })
  }

  private handleBreakpointResponse(message: Record<string, unknown>): void {
    const requestId = message.requestId as string
    const pending = this.pendingRequests.get(requestId)
    
    if (pending) {
      this.pendingRequests.delete(requestId)
      const response = message as unknown as BreakpointResponse
  
      if (response.success) {
        pending.resolve(response.payload)
        return
      }
  
      pending.reject(new Error(response.error ?? 'Breakpoint request failed'))
    }
  }

  private handleBroadcastMessage(msg: Record<string, unknown>): void {
    this.broadcast(msg.message as string)
  }

  private handlePausedMessage(message: Record<string, unknown>): void {
    this.queue(
      { type: 'Agent.debugger.paused', snapshot: message.snapshot },
      { kind: 'shared', flag: message.flag as SharedArrayBuffer },
    )
  }

  private handleStopMessage(): void {
    this.stop()
  }

  private stop(): void {
    for (const client of this.clients) {
      client.close()
    }

    this.wss.close(() => {
      this.server.close(() => workerPort.postMessage({ type: 'Debugger.stopped' }))
    })
  }

  broadcast(message: string): void {
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(message)
      }
    }
  }

  private normalizeCommand(input: unknown): DebugCommand | null {
    if (!input || typeof input !== 'object') {
      return null
    }

    const command = input as Record<string, unknown>
    if (!allowedCommandTypes.has(command.type as string)) {
      return null
    }

    return {
      type: command.type as string,
      seq: typeof command.seq === 'number' ? command.seq : 0,
    }
  }

  private resolvePause(command: DebugCommand): void {
    const pause = this.pauses.shift()

    if (!pause) {
      this.broadcast(JSON.stringify({ type: 'Debugger.command', command }))
      return
    }

    if (pause.flag) {
      const state = new Int32Array(pause.flag)
      Atomics.store(state, 0, 1)
      Atomics.notify(state, 0, 1)
    }
  }

  private queue(event: Record<string, unknown>, pause: PendingPause): void {
    this.broadcast(JSON.stringify(event))
    this.pauses.push(pause)
  }

  breakpoints(type: 'Debugger.breakpoints.list'): Promise<unknown>
  breakpoints(type: 'Debugger.breakpoints.set', payload: { point: string; enabled: boolean }): Promise<unknown>
  breakpoints(type: 'Debugger.breakpoints.setAll', payload: { enabled: boolean }): Promise<unknown>
  breakpoints(type: string, payload?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestId = randomUUID()
      this.pendingRequests.set(requestId, { resolve, reject })
      workerPort.postMessage({ type, requestId, ...(payload ?? {}) })
    })
  }

  private handleWebSocketConnection = (ws: WebSocket) => {
    this.clients.add(ws)

    ws.on('close', () => this.clients.delete(ws))
    ws.on('message', (data: Buffer) => {
      let parsed: unknown = null

      try {
        parsed = JSON.parse(data.toString())
      } catch {
        parsed = null
      }

      const command = this.normalizeCommand(parsed)
      if (!command) {
        return
      }

      this.resolvePause(command)
    })
  }

  private handleHttpUpgrade = (
    request: IncomingMessage, 
    socket: Socket, 
    head: Buffer
  ): void => {
    try {
      if (!request.url) {
        socket.destroy()
        return
      }

      const url = new URL(request.url, `http://${this.host}:${this.port}`)
      if (url.pathname !== `${this.base}/inspect`) {
        socket.destroy()
        return
      }

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request)
      })
    } catch {
      socket.destroy()
    }
  }
}

const workerServer = new ServiceWorkerServer(workerData as WorkerData)
workerServer.start()

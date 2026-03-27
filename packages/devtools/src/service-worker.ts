import { URL } from 'node:url'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { parentPort, workerData } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { WebSocketServer, type WebSocket } from 'ws'
import { createLoggerRoute } from './routes/logger'
import { createSessionRoute } from './routes/session'
import { createDebuggerRoute } from './routes/debugger'
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

  app.route('/logger', createLoggerRoute(server))
  app.route(`/session`,createSessionRoute(server))
  app.route(`/debugger`, createDebuggerRoute(server))

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
    this.server.on('upgrade', this.handleUpgrade)

    this.wss = new WebSocketServer({ noServer: true })
    this.wss.on('connection', this.handleConnection)

    workerPort.on('message', this.handleMessage)
  }

  start(): void {
    this.server.listen(this.port, this.host, () => workerPort.postMessage({ type: 'Debugger.started' }))
  }

  broadcast(message: string): void {
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(message)
      }
    }
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



  private handleMessage(data: unknown): void {
    const message = data as Record<string, unknown>

    switch (message.type) {
      case 'Debugger.breakpoints.response':
        this.handleBreakpointResponse(message)
      break
    case 'broadcast':
    case 'logger':
    case 'session':
      this.handleBroadcastMessage(message)
      break
    case 'paused':
      this.handlePausedMessage(message)
      break
    case 'stop':
      this.handleStopMessage()
      break
    default:
      break
    }
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

  private handleConnection = (ws: WebSocket) => {
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

  private handleUpgrade = (
    request: IncomingMessage, 
    socket: Socket, 
    head: Buffer
  ): void => {
    try {
      const url = new URL(request.url as string, `http://${this.host}:${this.port}`)
      if (url.pathname !== `${this.base}/inspect`) {
        socket.destroy()
      } else {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request)
        })
      }
    } catch {
      socket.destroy()
    }
  }
}

const workerServer = new ServiceWorkerServer(workerData as WorkerData)
workerServer.start()

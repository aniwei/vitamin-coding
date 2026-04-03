import { URL } from 'node:url'
import { Hono } from 'hono'
import { createServer, type IncomingMessage } from 'node:http'
import { parentPort, workerData } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  SAB_HEADER_SIZE,
  WAKE_RESUMED,
  WAKE_WITH_PAYLOAD,
  COMMAND_CONTINUE,
  COMMAND_NEXT,
  COMMAND_STEP,
  COMMAND_OVER,
  COMMAND_STOP,
} from './protocol'
import type { AddressInfo } from 'node:net'
import type { PauseResumePayload } from './protocol'
import type { Socket } from 'node:net'

interface WorkerData {
  host: string
  port?: number
  serviceId: string
}

interface PendingPause {
  flag: SharedArrayBuffer
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
    this.port = port ?? 0
    this.host = host
    this.serviceId = serviceId
    this.base = `/${this.serviceId}`

    this.server = createServer()
    this.server.on('upgrade', this.handleUpgrade)

    this.wss = new WebSocketServer({ noServer: true })
    this.wss.on('connection', this.handleConnection)

    workerPort.on('message', this.handleMessage)
  }

  start(): void {
    this.server.listen(this.port ?? 0, this.host, () => {
      const addr = this.server.address() as AddressInfo
      workerPort.postMessage({ type: 'Debugger.started', port: addr.port })
    })
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
      { flag: message.shared as SharedArrayBuffer },
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

  private resolvePause(command: DebugCommand, payload?: PauseResumePayload): void {
    const pause = this.pauses.shift()

    if (!pause) {
      this.broadcast(JSON.stringify({ type: 'Debugger.command', command }))
      return
    }

    const header = new Int32Array(pause.flag, 0, 3)
    const payloadRegion = new Uint8Array(pause.flag, SAB_HEADER_SIZE)

    Atomics.store(header, 1, this.encodeCommandType(command.type))

    if (payload && Object.keys(payload).length > 0) {
      const jsonBytes = new TextEncoder().encode(JSON.stringify(payload))

      if (jsonBytes.length <= payloadRegion.length) {
        payloadRegion.set(jsonBytes)
        Atomics.store(header, 2, jsonBytes.length)
        Atomics.store(header, 0, WAKE_WITH_PAYLOAD)
        Atomics.notify(header, 0, 1)
        return
      }
    }

    Atomics.store(header, 0, WAKE_RESUMED)
    Atomics.notify(header, 0, 1)
  }

  private encodeCommandType(type: string): number {
    switch (type) {
      case 'next': return COMMAND_NEXT
      case 'step': return COMMAND_STEP
      case 'over': return COMMAND_OVER
      case 'stop': return COMMAND_STOP
      case 'continue':
      default: return COMMAND_CONTINUE
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

      const msg = parsed as Record<string, unknown>
      const command = this.normalizeCommand(msg)
      if (!command) {
        return
      }

      const payload = msg?.payload as PauseResumePayload | undefined
      this.resolvePause(command, payload)
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

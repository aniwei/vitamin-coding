import { URL } from 'node:url'
import { createServer, type IncomingMessage } from 'node:http'
import { parentPort, workerData } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import { CDP_METHOD_TO_COMMAND } from './protocol'
import type { AddressInfo } from 'node:net'
import type { Socket } from 'node:net'
import type { PauseResumePayload, DebugCommand, CommandRejectCode } from './protocol'

interface WorkerData {
  host: string
  port?: number
  serviceId: string
}

interface PendingPause {
  pauseId: string
}

interface BreakpointResponse {
  requestId: string
  success: boolean
  payload?: unknown
  error?: string
}

interface InspectCommandMessage {
  command: DebugCommand
  pauseId?: string
  payload?: PauseResumePayload
}

const workerPort = (() => {
  if (!parentPort) {
    throw new Error('service-worker requires parentPort')
  }

  return parentPort
})()

export class ServiceWorker {
  private readonly port: number
  private readonly host: string
  private readonly serviceId: string
  private readonly pauses: PendingPause[] = []
  private readonly clients = new Set<WebSocket>()
  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
    }
  >()
  private readonly base: string
  private readonly server
  private readonly wss

  constructor({ serviceId, host, port }: WorkerData) {
    this.port = port ?? 0
    this.host = host
    this.serviceId = serviceId
    this.base = `/${this.serviceId}`

    this.server = createServer()
    this.server.on('upgrade', this.onUpgrade)

    this.wss = new WebSocketServer({ noServer: true })
    this.wss.on('connection', this.onConnection)

    workerPort.on('message', this.onMessage)
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
  breakpoints(
    type: 'Debugger.breakpoints.set',
    payload: { point: string; enabled: boolean },
  ): Promise<unknown>
  breakpoints(type: 'Debugger.breakpoints.setAll', payload: { enabled: boolean }): Promise<unknown>
  breakpoints(type: string, payload?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestId = randomUUID()
      this.pendingRequests.set(requestId, { resolve, reject })
      workerPort.postMessage({ type, requestId, ...payload })
    })
  }

  private onMessage = (data: unknown): void => {
    const message = data as Record<string, unknown>

    switch (message.type) {
      case 'Debugger.breakpoints.response':
        this.handleBreakpointResponse(message)
        break
      case 'Runtime.broadcast':
        this.handleRuntimeBroadcast(message)
        break
      case 'Log.entryAdded':
        this.handleLogMessage(message)
        break
      case 'Session.update':
        this.handleBroadcastMessage(message)
        break
      case 'Debugger.paused':
        this.handlePausedMessage(message)
        break
      case 'Debugger.resumed':
        break
      case 'Runtime.stop':
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

  private handleLogMessage(message: Record<string, unknown>): void {
    this.broadcast(JSON.stringify(message))
  }

  private handleRuntimeBroadcast(message: Record<string, unknown>): void {
    if (typeof message.message === 'string') {
      this.broadcast(message.message)
    }
  }

  private handleBroadcastMessage(message: Record<string, unknown>): void {
    this.broadcast(JSON.stringify(message))
  }

  private handlePausedMessage(message: Record<string, unknown>): void {
    const pauseId = message.pauseId as string
    this.queue({ type: 'Debugger.paused', pauseId, snapshot: message.snapshot }, { pauseId })
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
    if (typeof command.type !== 'string') {
      return null
    }

    const seq = typeof command.seq === 'number' ? command.seq : 0

    // Support CDP-style methods (Debugger.resume → continue)
    const resolvedType = CDP_METHOD_TO_COMMAND[command.type] ?? command.type

    switch (resolvedType) {
      case 'next':
      case 'step':
      case 'continue':
        return { type: resolvedType, seq }
      case 'over':
        return {
          type: 'over',
          seq,
          depth: typeof command.depth === 'number' ? command.depth : 0,
        }
      case 'stop':
        return {
          type: 'stop',
          seq,
          reason: typeof command.reason === 'string' ? command.reason : undefined,
        }
      default:
        return null
    }
  }

  private resolve(command: DebugCommand, pauseId?: string, payload?: PauseResumePayload): void {
    const pause = pauseId ? this.findPause(pauseId) : this.pauses.shift()

    if (!pause) {
      this.broadcastCommandRejected('STALE_OR_NO_PAUSE', command, pauseId)
      return
    }

    workerPort.postMessage({
      type: 'Debugger.resumed',
      pauseId: pause.pauseId,
      command,
      payload: payload ?? null,
    })

    this.broadcast(
      JSON.stringify({
        type: 'Debugger.resumed',
        pauseId: pause.pauseId,
        command,
      }),
    )
  }

  private findPause(pauseId: string): PendingPause | undefined {
    const idx = this.pauses.findIndex((p) => p.pauseId === pauseId)
    if (idx === -1) return undefined
    return this.pauses.splice(idx, 1)[0]
  }

  private broadcastCommandRejected(
    code: CommandRejectCode,
    command: DebugCommand,
    pauseId?: string,
  ): void {
    this.broadcast(
      JSON.stringify({
        type: 'Debugger.commandRejected',
        code,
        command,
        pauseId,
      }),
    )
  }

  private queue(event: Record<string, unknown>, pause: PendingPause): void {
    this.broadcast(JSON.stringify(event))
    this.pauses.push(pause)
  }

  private onConnection = (ws: WebSocket) => {
    this.clients.add(ws)

    ws.on('close', () => this.clients.delete(ws))
    ws.on('message', (data: Buffer) => this.handleInspectClientMessage(data))
  }

  private handleInspectClientMessage(data: Buffer): void {
    const message = this.parseInspectCommandMessage(data)
    if (!message) {
      return
    }

    this.dispatchInspectCommand(message)
  }

  private parseInspectCommandMessage(data: Buffer): InspectCommandMessage | null {
    const parsed = this.parseJson(data)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }

    const message = parsed as Record<string, unknown>
    const command = this.normalizeCommand(message)
    if (!command) {
      return null
    }

    return {
      command,
      pauseId: typeof message.pauseId === 'string' ? message.pauseId : undefined,
      payload: this.asPausePayload(message.payload),
    }
  }

  private dispatchInspectCommand(message: InspectCommandMessage): void {
    switch (message.command.type) {
      case 'continue':
        this.handleContinueCommand(message)
        break
      case 'next':
        this.handleNextCommand(message)
        break
      case 'step':
        this.handleStepCommand(message)
        break
      case 'over':
        this.handleOverCommand(message)
        break
      case 'stop':
        this.handleStopCommand(message)
        break
      default:
        break
    }
  }

  private handleContinueCommand(message: InspectCommandMessage): void {
    this.resolve(message.command, message.pauseId, message.payload)
  }

  private handleNextCommand(message: InspectCommandMessage): void {
    this.resolve(message.command, message.pauseId, message.payload)
  }

  private handleStepCommand(message: InspectCommandMessage): void {
    this.resolve(message.command, message.pauseId, message.payload)
  }

  private handleOverCommand(message: InspectCommandMessage): void {
    this.resolve(message.command, message.pauseId, message.payload)
  }

  private handleStopCommand(message: InspectCommandMessage): void {
    this.resolve(message.command, message.pauseId, message.payload)
  }

  private parseJson(data: Buffer): unknown {
    try {
      return JSON.parse(data.toString()) as unknown
    } catch {
      return null
    }
  }

  private asPausePayload(value: unknown): PauseResumePayload | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as PauseResumePayload
    }

    return undefined
  }

  private onUpgrade = (request: IncomingMessage, socket: Socket, head: Buffer): void => {
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

const workerServer = new ServiceWorker(workerData as WorkerData)
workerServer.start()

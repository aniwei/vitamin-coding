import WebSocket from 'ws'
import { createLogger, TypedEventEmitter, type Events } from '@vitamin/shared'
import { routeDebugEvent } from './debug-event-router'
import type { IMessageSender, LogEntryData } from './types'
import type { Devtools } from '@vitamin/devtools'
import type { PauseResumePayload } from '@vitamin/devtools'

const logger = createLogger('@vitamin/service:debug-bridge')

/** @deprecated Use LogEntryData from './types' instead */
export type LogEntry = LogEntryData

interface DebugBridgeEvents extends Events {
  'Debugger.paused': (data: Record<string, unknown>) => void
  'Debugger.resumed': (data: Record<string, unknown>) => void
  'Debugger.commandRejected': (data: Record<string, unknown>) => void
  'Log.entryAdded': (entry: LogEntryData) => void
}

interface SendCommand {
  type: string
  seq: number
  depth?: number
  [extra: string]: unknown
}

export class DebugBridge extends TypedEventEmitter<DebugBridgeEvents> {
  private logId = 0
  private socket: WebSocket | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly logs: LogEntryData[] = []

  constructor(
    private readonly devtools: Devtools,
    private readonly sender: IMessageSender,
  ) {
    super()
  }

  attach(): void {
    this.connect()
  }

  detach(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    this.socket?.close()
    this.socket = null
  }

  dispose(): void {
    this.detach()
    this.removeAllListeners()
  }

  send(command: SendCommand, payload?: PauseResumePayload): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ ...command, payload }))
    } else {
      logger.warn('debug bridge not connected, command dropped')
      this.sender.broadcast({
        type: 'Debugger.commandRejected',
        data: {
          code: 'BRIDGE_DISCONNECTED',
          command,
          timestamp: new Date().toISOString(),
        },
      })
    }
  }

  getLogs(): LogEntryData[] {
    return [...this.logs]
  }

  private connect(): void {
    const inspectUrl = this.devtools.service.url

    this.socket = new WebSocket(inspectUrl)

    this.socket.on('open', () => {
      logger.info('debug bridge connected to devtools worker')
    })

    this.socket.on('message', (data: Buffer) => {
      try {
        const event = JSON.parse(data.toString())
        this.handleDevtoolsEvent(event)
      } catch {
        logger.warn('invalid message from devtools worker')
      }
    })

    this.socket.on('close', () => {
      logger.info('debug bridge disconnected, scheduling reconnect')
      this.reconnect()
    })

    this.socket.on('error', (err) => {
      logger.warn({ err: err.message }, 'debug bridge error')
    })
  }

  private reconnect(): void {
    this.timer = setTimeout(() => this.connect(), 20_000)
  }

  private handleDevtoolsEvent(event: Record<string, unknown>): void {
    switch (event.type) {
      case 'Debugger.paused':
      case 'Debugger.resumed':
      case 'Debugger.commandRejected': {
        const messages = routeDebugEvent(event)
        for (const msg of messages) {
          this.sender.broadcast(msg)
        }
        break
      }

      case 'Log.entryAdded': {
        const raw = event.message
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        this.handleLogMessage(parsed as Record<string, unknown>)
        break
      }

      default:
        this.handleLogMessage(event)
        break
    }
  }

  private handleLogMessage(event: Record<string, unknown>): void {
    if (typeof event.level !== 'undefined' || typeof event.msg === 'string') {
      const rawTime = event.time
      const timestamp =
        typeof rawTime === 'number'
          ? new Date(rawTime).toISOString()
          : typeof rawTime === 'string'
            ? rawTime
            : new Date().toISOString()

      const entry: LogEntryData = {
        id: ++this.logId,
        timestamp,
        level: this.normalizeLevel(event.level),
        module: (event.name as string) ?? 'unknown',
        message: (event.msg as string) ?? JSON.stringify(event),
        data: event,
      }

      this.logs.push(entry)
      if (this.logs.length > 2000) {
        this.logs.splice(0, this.logs.length - 2000)
      }

      this.sender.broadcast({
        type: 'Log.entryAdded',
        data: { entry },
      })

      this.emit('Log.entryAdded', entry)
    }
  }

  private normalizeLevel(level: unknown): string {
    if (typeof level === 'string') {
      const l = level.toLowerCase()
      if (['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(l)) {
        return l
      }
    }

    if (typeof level === 'number') {
      if (level <= 10) {
        return 'trace'
      }
      if (level <= 20) {
        return 'debug'
      }
      if (level <= 30) {
        return 'info'
      }
      if (level <= 40) {
        return 'warn'
      }
      if (level <= 50) {
        return 'error'
      }
      return 'fatal'
    }

    return 'info'
  }
}

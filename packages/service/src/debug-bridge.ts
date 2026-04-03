import WebSocket from 'ws'
import { createLogger } from '@vitamin/shared'
import type { WebSocketManager } from './websocket-manager'
import type { Devtools } from '@vitamin/devtools'
import type { PauseResumePayload } from '@vitamin/devtools'

const logger = createLogger('@vitamin/service:debug-bridge')

export interface LogEntry {
  id: number
  timestamp: string
  level: string
  module: string
  message: string
  data?: Record<string, unknown>
}

type LogListener = (entry: LogEntry) => void

export class DebugBridge {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private readonly logBuffer: LogEntry[] = []
  private readonly logListeners = new Set<LogListener>()
  private logIdCounter = 0

  constructor(
    private readonly devtools: Devtools,
    private readonly wsManager: WebSocketManager,
  ) {}

  attach(): void {
    this.connect()
  }

  detach(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }

  sendCommand(
    command: { type: string; seq: number; depth?: number },
    payload?: PauseResumePayload,
  ): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...command, payload }))
    } else {
      logger.warn('debug bridge not connected, command dropped')
    }
  }

  getLogBuffer(): LogEntry[] {
    return [...this.logBuffer]
  }

  onLog(listener: LogListener): () => void {
    this.logListeners.add(listener)
    return () => {
      this.logListeners.delete(listener)
    }
  }

  private connect(): void {
    const inspectUrl = this.devtools.service.serviceUrl
      .replace('http://', 'ws://') + '/inspect'

    this.ws = new WebSocket(inspectUrl)

    this.ws.on('open', () => {
      logger.info('debug bridge connected to devtools worker')
    })

    this.ws.on('message', (data: Buffer) => {
      try {
        const event = JSON.parse(data.toString())
        this.handleDevtoolsEvent(event)
      } catch {
        logger.warn('invalid message from devtools worker')
      }
    })

    this.ws.on('close', () => {
      logger.info('debug bridge disconnected, scheduling reconnect')
      this.scheduleReconnect()
    })

    this.ws.on('error', (err) => {
      logger.warn(`debug bridge error: ${err.message}`)
    })
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => this.connect(), 2000)
  }

  private handleDevtoolsEvent(event: Record<string, unknown>): void {
    switch (event.type) {
      case 'Agent.debugger.paused':
        this.wsManager.broadcast({
          type: 'Debugger.paused',
          data: {
            reason: 'breakpoint',
            point: (event.snapshot as Record<string, unknown>)?.point,
            snapshot: event.snapshot as Record<string, unknown>,
            timestamp: new Date().toISOString(),
          },
        })
        break

      case 'Debugger.command':
        this.wsManager.broadcast({
          type: 'Debugger.resumed',
          data: {
            command: event.command as Record<string, unknown>,
            timestamp: new Date().toISOString(),
          },
        })
        break

      default:
        this.handleLogMessage(event)
        break
    }
  }

  private handleLogMessage(event: Record<string, unknown>): void {
    if (typeof event.level !== 'undefined' || typeof event.msg === 'string') {
      const entry: LogEntry = {
        id: ++this.logIdCounter,
        timestamp: (event.time as string) ?? new Date().toISOString(),
        level: this.normalizeLevel(event.level),
        module: (event.name as string) ?? 'unknown',
        message: (event.msg as string) ?? JSON.stringify(event),
        data: event,
      }

      this.logBuffer.push(entry)
      if (this.logBuffer.length > 2000) {
        this.logBuffer.splice(0, this.logBuffer.length - 2000)
      }

      this.wsManager.broadcast({
        type: 'Log.entryAdded',
        data: { entry: entry as unknown as Record<string, unknown> },
      })

      for (const listener of this.logListeners) {
        listener(entry)
      }
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
      if (level <= 10) return 'trace'
      if (level <= 20) return 'debug'
      if (level <= 30) return 'info'
      if (level <= 40) return 'warn'
      if (level <= 50) return 'error'
      return 'fatal'
    }
    return 'info'
  }
}

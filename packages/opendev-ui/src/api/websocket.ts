import { asRecord, normalizeKeysToCamel } from '@x-mars/shared/browser/data'
import type { WebSocketMessage } from '../types'

export type WebSocketEventHandler = (message: WebSocketMessage) => void

export interface CDPCommandMessage {
  id?: number
  method: string
  params?: Record<string, unknown>
}

class WebSocketClient {
  private ws: WebSocket | null = null
  private handlers: Map<string, Set<WebSocketEventHandler>> = new Map()
  private pendingCommands: CDPCommandMessage[] = []
  private reconnectTimer: number | null = null
  private reconnectAttempts = 0
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private intentionalClose = false
  private pingInterval: number | null = null
  private pongTimeout: number | null = null
  private pongTimeoutMs = 10000
  private visibilityListenerAdded = false
  private nextCommandId = 1

  connect() {
    // 防止重复连接
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)
    ) {
      console.log('WebSocket already connecting or connected')
      return
    }

    this.intentionalClose = false
    this.emitConnectionState('connecting')

    // 开发环境使用代理，生产环境直连后端
    const isDev = import.meta.env.DEV
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

    // 开发模式直连后端，避免与 Vite HMR WebSocket 冲突
    // 生产模式使用相同主机（静态文件由后端托管）
    const wsUrl = isDev
      ? 'ws://127.0.0.1:8080/ws' // 开发环境直连
      : `${protocol}//${window.location.host}/ws` // 生产环境相对路径

    console.log('Connecting to WebSocket:', wsUrl, `(dev mode: ${isDev})`)

    try {
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        console.log('WebSocket connected successfully')
        this.reconnectAttempts = 0
        this.emitConnectionState('connected')
        this.emit({ type: 'Runtime.connected', data: {} })
        this.startHeartbeat()
        this.flushPendingCommands()
      }

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          if (message.type === 'Runtime.pong') {
            this.clearPongTimeout()
          }
          this.emit({
            ...message,
            data: normalizeKeysToCamel(message.data),
          })
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason)
        this.ws = null
        this.stopHeartbeat()
        this.clearPongTimeout()
        this.emitConnectionState('disconnected')
        this.emit({ type: 'Runtime.disconnected', data: {} })

        if (!this.intentionalClose) {
          this.attemptReconnect()
        }
      }
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
      this.attemptReconnect()
    }

    // 运行一次注册可见性变化监听器
    if (!this.visibilityListenerAdded) {
      this.visibilityListenerAdded = true
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && !this.intentionalClose) {
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log('Tab became visible, reconnecting WebSocket...')
            this.connect()
          }
        }
      })
    }
  }

  disconnect() {
    this.intentionalClose = true
    this.stopHeartbeat()
    this.clearPongTimeout()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.pendingCommands = []
    this.emitConnectionState('disconnected')
  }

  send(message: CDPCommandMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendNow(message)
    } else {
      this.pendingCommands.push(message)
      this.emitConnectionState('reconnecting')
      console.warn('WebSocket is not connected; command queued')
    }
  }

  sendCommand(method: string, params: Record<string, unknown> = {}, id?: number) {
    this.send({ id, method, params })
  }

  ping() {
    this.sendCommand('Runtime.ping', { timestamp: Date.now() })
  }

  on(eventType: string, handler: WebSocketEventHandler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set())
    }
    const set = this.handlers.get(eventType)
    if (set) {
      set.add(handler)
    }

    // 返回取消订阅函数
    return () => {
      const handlers = this.handlers.get(eventType)
      if (handlers) {
        handlers.delete(handler)
      }
    }
  }

  private emit(message: WebSocketMessage) {
    // 向具体类型的处理器分发
    const typeHandlers = this.handlers.get(message.type)
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        handler(message)
      }
    }

    // 向通配处理器分发
    const wildcardHandlers = this.handlers.get('*')
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        handler(message)
      }
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.pingInterval = window.setInterval(() => {
      this.ping()
      this.armPongTimeout()
    }, 30000)
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  private armPongTimeout() {
    this.clearPongTimeout()
    this.pongTimeout = window.setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.warn('WebSocket heartbeat timed out, reconnecting')
        this.ws.close()
      }
    }, this.pongTimeoutMs)
  }

  private clearPongTimeout() {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout)
      this.pongTimeout = null
    }
  }

  private attemptReconnect() {
    // 清除已有的重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.reconnectAttempts++
    const delay = Math.min(
      this.reconnectDelay * 2 ** (this.reconnectAttempts - 1),
      this.maxReconnectDelay,
    )

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`)
    this.emitConnectionState('reconnecting', { attempt: this.reconnectAttempts, delayMs: delay })

    this.reconnectTimer = window.setTimeout(() => {
      this.connect()
    }, delay)
  }

  private flushPendingCommands() {
    const commands = this.pendingCommands.splice(0)
    for (const command of commands) {
      this.sendNow(command)
    }
  }

  private sendNow(message: CDPCommandMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.pendingCommands.unshift(message)
      return
    }

    this.ws.send(
      JSON.stringify({
        id: message.id ?? this.nextCommandId++,
        method: message.method,
        params: asRecord(message.params),
      }),
    )
  }

  private emitConnectionState(
    status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected',
    extra: Record<string, unknown> = {},
  ) {
    this.emit({
      type: 'Runtime.connectionState',
      data: {
        status,
        timestamp: new Date().toISOString(),
        queuedCommands: this.pendingCommands.length,
        ...extra,
      },
    })
  }
}
export const ws = new WebSocketClient()

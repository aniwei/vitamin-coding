import type { WebSocketMessage } from '../types'

export type WebSocketEventHandler = (message: WebSocketMessage) => void

export interface CDPCommandMessage {
  id?: number
  method: string
  params?: Record<string, unknown>
}

function toCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

function normalizeToCamel<T>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeToCamel(item)) as T
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[toCamelKey(key)] = normalizeToCamel(val)
    }
    return out as T
  }

  return value as T
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return {}
}

class WebSocketClient {
  private ws: WebSocket | null = null
  private handlers: Map<string, Set<WebSocketEventHandler>> = new Map()
  private reconnectTimer: number | null = null
  private reconnectAttempts = 0
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private intentionalClose = false
  private pingInterval: number | null = null
  private visibilityListenerAdded = false
  private nextCommandId = 1

  connect() {
    // Prevent multiple connections
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)
    ) {
      console.log('WebSocket already connecting or connected')
      return
    }

    this.intentionalClose = false

    // Use proxy in development, or direct connection in production
    const isDev = import.meta.env.DEV
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

    // In dev, connect directly to backend to avoid Vite HMR WebSocket conflicts
    // In prod, use the same host (since static files are served by backend)
    const wsUrl = isDev
      ? 'ws://127.0.0.1:8080/ws' // Direct connection in dev
      : `${protocol}//${window.location.host}/ws` // Relative in prod

    console.log('Connecting to WebSocket:', wsUrl, `(dev mode: ${isDev})`)

    try {
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        console.log('WebSocket connected successfully')
        this.reconnectAttempts = 0
        this.emit({ type: 'Runtime.connected', data: {} })
        this.startHeartbeat()
      }

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          this.emit({
            ...message,
            data: normalizeToCamel(message.data),
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
        this.emit({ type: 'Runtime.disconnected', data: {} })

        if (!this.intentionalClose) {
          this.attemptReconnect()
        }
      }
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
      this.attemptReconnect()
    }

    // Register visibility change listener once
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  send(message: CDPCommandMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          id: message.id ?? this.nextCommandId++,
          method: message.method,
          params: asRecord(message.params),
        }),
      )
    } else {
      console.warn('WebSocket is not connected')
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
    if (set) set.add(handler)

    // Return unsubscribe function
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
      for (const handler of typeHandlers) handler(message)
    }

    // 向通配处理器分发
    const wildcardHandlers = this.handlers.get('*')
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) handler(message)
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.pingInterval = window.setInterval(() => {
      this.ping()
    }, 30000)
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  private attemptReconnect() {
    // Clear any existing reconnect timer
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

    this.reconnectTimer = window.setTimeout(() => {
      this.connect()
    }, delay)
  }
}
 export const ws = new WebSocketClient()
 
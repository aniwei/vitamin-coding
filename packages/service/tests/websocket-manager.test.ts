import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { WebSocketManager } from '../src/websocket-manager'
import { validateWebSocketMessage } from '../src/ws-protocol'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'

class FakeWebSocket extends EventEmitter {
  OPEN = 1
  readyState = 1
  sent: string[] = []
  ping = vi.fn()
  close = vi.fn()
  terminate = vi.fn(() => {
    this.readyState = 3
    this.emit('close')
  })

  send(payload: string): void {
    this.sent.push(payload)
  }
}

class FakeSocket {
  writes: string[] = []
  destroyed = false

  write(payload: string): void {
    this.writes.push(payload)
  }

  destroy(): void {
    this.destroyed = true
  }
}

describe('WebSocketManager', () => {
  it('does not broadcast session messages when no client subscribed to that session', () => {
    const manager = new WebSocketManager({ heartbeatIntervalMs: 0 })
    const broadcast = vi.spyOn(manager, 'broadcast')

    manager.sendToSession('session-without-subscribers', {
      type: 'Runtime.connected',
      data: { clientId: 'client-1' },
    })

    expect(broadcast).not.toHaveBeenCalled()
    manager.close()
  })

  it('does not send invalid outbound messages', () => {
    const manager = new WebSocketManager({ heartbeatIntervalMs: 0 })
    const ws = new FakeWebSocket()
    ;(manager as unknown as { onConnection: (ws: FakeWebSocket) => void }).onConnection(ws)

    manager.sendToClient('1', {
      type: 'Chat.toolResult',
      data: { sessionId: 's1', id: 'tc1', name: 'bash' },
    } as never)

    expect(ws.sent).toHaveLength(2)
    expect(JSON.parse(ws.sent[0] ?? '{}')).toMatchObject({ type: 'Runtime.connected' })
    manager.close()
  })

  it('pings live clients and terminates stale clients', () => {
    const manager = new WebSocketManager({ heartbeatIntervalMs: 0 })
    const ws = new FakeWebSocket()
    ;(manager as unknown as { onConnection: (ws: FakeWebSocket) => void }).onConnection(ws)

    ;(manager as unknown as { checkHeartbeats: () => void }).checkHeartbeats()
    expect(ws.ping).toHaveBeenCalledTimes(1)
    expect(manager.clientCount).toBe(1)

    ;(manager as unknown as { checkHeartbeats: () => void }).checkHeartbeats()
    expect(ws.terminate).toHaveBeenCalledTimes(1)
    expect(manager.clientCount).toBe(0)

    manager.close()
  })

  it('removes stale clients from session subscriptions', () => {
    const manager = new WebSocketManager({ heartbeatIntervalMs: 0 })
    const ws = new FakeWebSocket()
    ;(manager as unknown as { onConnection: (ws: FakeWebSocket) => void }).onConnection(ws)
    manager.subscribeClient('1', 's1')

    ;(manager as unknown as { checkHeartbeats: () => void }).checkHeartbeats()
    ;(manager as unknown as { checkHeartbeats: () => void }).checkHeartbeats()
    manager.sendToSession('s1', {
      type: 'Chat.messageComplete',
      data: { sessionId: 's1' },
    })

    expect(ws.terminate).toHaveBeenCalledTimes(1)
    expect(manager.clientCount).toBe(0)
    expect(ws.sent.map((payload) => JSON.parse(payload).type)).toEqual([
      'Runtime.connected',
      'Runtime.connectionState',
    ])

    manager.close()
  })

  it('fans out session messages to event sinks without websocket subscribers', () => {
    const manager = new WebSocketManager({ heartbeatIntervalMs: 0 })
    const received: unknown[] = []
    const unsubscribe = manager.subscribeSessionEvents('s1', (message) => received.push(message))

    manager.sendToSession('s1', {
      type: 'Chat.messageComplete',
      data: { sessionId: 's1' },
    })
    unsubscribe()
    manager.sendToSession('s1', {
      type: 'Chat.messageComplete',
      data: { sessionId: 's1' },
    })

    expect(received).toEqual([
      {
        type: 'Chat.messageComplete',
        data: { sessionId: 's1' },
      },
    ])
    manager.close()
  })

  it('rejects websocket upgrades when configured auth token is missing', () => {
    const manager = new WebSocketManager({ heartbeatIntervalMs: 0, authToken: 'secret' })
    const socket = new FakeSocket()
    const request = {
      url: '/ws',
      headers: {},
    } as IncomingMessage

    const handled = manager.handleUpgrade(
      request,
      socket as unknown as Socket,
      Buffer.alloc(0),
      '/ws',
    )

    expect(handled).toBe(true)
    expect(socket.writes[0]).toContain('401 Unauthorized')
    expect(socket.destroyed).toBe(true)
    manager.close()
  })

  it('accepts websocket upgrades with bearer token', () => {
    const manager = new WebSocketManager({ heartbeatIntervalMs: 0, authToken: 'secret' })
    const socket = new FakeSocket()
    const request = {
      url: '/ws',
      headers: { authorization: 'Bearer secret' },
    } as IncomingMessage
    const wss = (
      manager as unknown as {
        wss: {
          handleUpgrade: (
            request: IncomingMessage,
            socket: Socket,
            head: Buffer,
            cb: () => void,
          ) => void
        }
      }
    ).wss
    const handleUpgrade = vi.spyOn(wss, 'handleUpgrade').mockImplementation(() => {})

    const handled = manager.handleUpgrade(
      request,
      socket as unknown as Socket,
      Buffer.alloc(0),
      '/ws',
    )

    expect(handled).toBe(true)
    expect(socket.writes).toEqual([])
    expect(handleUpgrade).toHaveBeenCalledOnce()
    manager.close()
    handleUpgrade.mockRestore()
  })
})

describe('validateWebSocketMessage', () => {
  it('accepts valid structured tool execution events', () => {
    expect(
      validateWebSocketMessage({
        type: 'Chat.toolExecutionEvent',
        data: {
          sessionId: 's1',
          event: {
            type: 'progress',
            toolCallId: 'tc1',
            toolName: 'bash',
            update: 'running tests',
            timestamp: 123,
          },
        },
      }),
    ).toEqual({ valid: true })
  })

  it('validates runtime connection state events', () => {
    expect(
      validateWebSocketMessage({
        type: 'Runtime.connectionState',
        data: {
          status: 'reconnecting',
          timestamp: '2026-05-02T10:00:00.000Z',
          attempt: 2,
          delayMs: 2000,
          queuedCommands: 1,
        },
      }),
    ).toEqual({ valid: true })

    expect(
      validateWebSocketMessage({
        type: 'Runtime.connectionState',
        data: { status: 'bad', timestamp: '2026-05-02T10:00:00.000Z' },
      }),
    ).toMatchObject({
      valid: false,
      reason: 'data.status must be a known connection status',
    })
  })

  it('rejects unknown message types and missing required fields', () => {
    expect(validateWebSocketMessage({ type: 'Chat.unknown', data: {} })).toMatchObject({
      valid: false,
    })
    expect(
      validateWebSocketMessage({
        type: 'Chat.toolExecutionEvent',
        data: { sessionId: 's1', event: { type: 'progress' } },
      }),
    ).toMatchObject({
      valid: false,
      reason: 'missing data.event.toolCallId',
    })
  })

  it('rejects unknown tool execution event types and malformed nested fields', () => {
    expect(
      validateWebSocketMessage({
        type: 'Chat.toolExecutionEvent',
        data: {
          sessionId: 's1',
          event: {
            type: 'mystery',
            toolCallId: 'tc1',
            toolName: 'bash',
            timestamp: 123,
          },
        },
      }),
    ).toMatchObject({
      valid: false,
      reason: 'unknown data.event.type: mystery',
    })

    expect(
      validateWebSocketMessage({
        type: 'Chat.toolExecutionEvent',
        data: {
          sessionId: 's1',
          event: {
            type: 'progress',
            toolCallId: 'tc1',
            toolName: 'bash',
            timestamp: 'bad',
          },
        },
      }),
    ).toMatchObject({
      valid: false,
      reason: 'data.event.timestamp must be a number',
    })
  })

  it('validates patch review events', () => {
    expect(
      validateWebSocketMessage({
        type: 'Chat.reviewFailed',
        data: {
          sessionId: 's1',
          review: {
            id: 'tc1:patch-review',
            reviewType: 'patch',
            toolCallId: 'tc1',
            toolName: 'write',
            risk: 'high',
            targets: ['package.json'],
            blocked: true,
            reasons: ['high-risk target: package.json'],
          },
          issues: ['high-risk target: package.json'],
        },
      }),
    ).toEqual({ valid: true })

    expect(
      validateWebSocketMessage({
        type: 'Chat.reviewRequested',
        data: {
          sessionId: 's1',
          review: {
            id: 'tc1:patch-review',
            reviewType: 'patch',
            toolCallId: 'tc1',
            toolName: 'write',
            risk: 'critical',
            targets: [],
            blocked: false,
            reasons: [],
          },
        },
      }),
    ).toMatchObject({
      valid: false,
      reason: 'data.review.risk must be low, medium, or high',
    })
  })
})

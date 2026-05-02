import { describe, expect, it, vi } from 'vitest'
import { InboundRouter } from '../src/inbound-router'
import type { WebSocketManager } from '../src/websocket-manager'
import type { XMarsContext } from '@x-mars/coding'

describe('InboundRouter', () => {
  it('subscribes only to existing sessions', () => {
    const ws = {
      subscribeClient: vi.fn(),
      sendToClient: vi.fn(),
    }
    const xMars = {
      getSession: vi.fn((id: string) => (id === 's1' ? { id: 's1' } : undefined)),
    }
    const router = new InboundRouter(
      ws as unknown as WebSocketManager,
      xMars as unknown as XMarsContext,
      null,
    )

    router.dispatch('client-1', {
      type: 'Session.subscribe',
      data: { sessionId: 'missing' },
    })
    router.dispatch('client-1', {
      type: 'Session.subscribe',
      data: { sessionId: 's1' },
    })

    expect(ws.sendToClient).toHaveBeenCalledWith('client-1', {
      type: 'Runtime.error',
      data: { sessionId: 'missing', message: 'Session "missing" not found' },
    })
    expect(ws.subscribeClient).toHaveBeenCalledTimes(1)
    expect(ws.subscribeClient).toHaveBeenCalledWith('client-1', 's1')
  })

  it('routes patch review responses to the target session', () => {
    const resolvePatchReview = vi.fn()
    const ws = {
      subscribeClient: vi.fn(),
      sendToClient: vi.fn(),
    }
    const xMars = {
      getSession: vi.fn((id: string) => (id === 's1' ? { id: 's1', resolvePatchReview } : undefined)),
      getActiveSession: vi.fn(() => undefined),
    }
    const router = new InboundRouter(
      ws as unknown as WebSocketManager,
      xMars as unknown as XMarsContext,
      null,
    )

    router.dispatch('client-1', {
      type: 'Chat.reviewResponse',
      data: {
        sessionId: 's1',
        reviewId: 'tc1:patch-review',
        approved: true,
      },
    })

    expect(resolvePatchReview).toHaveBeenCalledWith('tc1:patch-review', true, undefined)
  })
})

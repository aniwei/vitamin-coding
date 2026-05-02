import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { CodingService } from '../coding-service'
import type { WebSocketMessage } from '../types'

export function createEventsRoute(context: CodingService): Hono {
  const app = new Hono()

  app.get('/sessions/:id/stream', (c) => {
    const sessionId = c.req.param('id')
    if (!context.getSession(sessionId)) {
      return c.json({ error: `Session "${sessionId}" not found` }, 404)
    }

    return streamSSE(c, async (stream) => {
      const unsubscribe = context.ws.subscribeSessionEvents(sessionId, (message) => {
        stream.writeSSE({
          event: message.type,
          data: JSON.stringify(message),
        })
      })

      stream.onAbort(() => unsubscribe())
    })
  })

  app.get('/sessions/:id/ndjson', (c) => {
    const sessionId = c.req.param('id')
    if (!context.getSession(sessionId)) {
      return c.json({ error: `Session "${sessionId}" not found` }, 404)
    }

    const encoder = new TextEncoder()
    let unsubscribe: (() => void) | undefined
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        unsubscribe = context.ws.subscribeSessionEvents(sessionId, (message: WebSocketMessage) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`))
        })
      },
      cancel: () => {
        unsubscribe?.()
      },
    })

    return new Response(body, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  })

  return app
}

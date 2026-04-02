import { Hono } from 'hono'
import type { VitaminContext } from '@vitamin/coding'
import type { WebSocketManager } from '../websocket-manager'
import type { EventBridge } from '../event-bridge'

export function createChatRoute(
  ctx: VitaminContext,
  ws: WebSocketManager,
  _bridges: Map<string, EventBridge>,
): Hono {
  const app = new Hono()

  // POST /chat/query — send a prompt to the active (or specified) session
  app.post('/query', async (c) => {
    const body = await c.req.json<{ message: string; sessionId?: string }>()
    const { message, sessionId } = body

    if (!message) {
      return c.json({ status: 'error', message: 'message is required' }, 400)
    }

    let session = sessionId
      ? ctx.getSession(sessionId)
      : ctx.sessionManager.active

    if (!session) {
      // Auto-create a session if none exists
      session = await ctx.createSession()
    }

    // Non-blocking: fire prompt and return immediately.
    // Streaming results go over WebSocket.
    session.prompt(message).catch((err) => {
      ws.sendToSession(session!.id, {
        type: 'error',
        data: { sessionId: session!.id, message: err.message },
      })
    })

    return c.json({
      status: 'ok',
      message: 'prompt accepted',
      sessionId: session.id,
    })
  })

  // GET /chat/messages — get messages for the active session
  app.get('/messages', (c) => {
    const session = ctx.sessionManager.active
    if (!session) {
      return c.json([])
    }
    return c.json(serializeMessages(session))
  })

  // POST /chat/interrupt — abort the active session
  app.post('/interrupt', (c) => {
    const session = ctx.sessionManager.active
    if (!session) {
      return c.json({ status: 'error', message: 'no active session' }, 404)
    }
    session.abort()
    return c.json({ status: 'ok', message: 'interrupted' })
  })

  // DELETE /chat/clear — clear messages in the active session
  app.delete('/clear', async (c) => {
    const session = ctx.sessionManager.active
    if (!session) {
      return c.json({ status: 'error', message: 'no active session' }, 404)
    }
    // compact with empty summary effectively clears
    await session.compact('', session.session.messages().length)
    return c.json({ status: 'ok', message: 'cleared' })
  })

  return app
}

function serializeMessages(session: { session: { messages(): unknown[] } }) {
  const messages = session.session.messages()
  return messages.map((msg: any) => ({
    role: msg.role,
    content: serializeContent(msg),
    timestamp: msg.timestamp,
    tool_calls: msg.content?.filter?.((b: any) => b.type === 'tool_call') ?? [],
  }))
}

function serializeContent(msg: any): string {
  if (typeof msg.content === 'string') {
    return msg.content
  }
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
  }
  return ''
}

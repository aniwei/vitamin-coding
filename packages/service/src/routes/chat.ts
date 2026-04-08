import { Hono } from 'hono'
import type { CodingService } from '../coding-service'

export function createChatRoute(
  service: CodingService
): Hono {
  const app = new Hono()

  app.post('/query', async (c) => {
    const body = await c.req.json<{ message: string; sessionId?: string }>()
    const { message, sessionId } = body

    if (!message) {
      return c.json({ status: 'error', message: 'message is required' }, 400)
    }

    const session = sessionId
      ? service.getSession(sessionId)
      : service.getActiveSession()

    if (!session) {
      return c.json({ status: 'error', message: 'no active session' }, 404)
    }

    session.prompt(message).catch((err) => {
      service.ws.sendToSession(session!.id, {
        type: 'Runtime.error',
        data: { sessionId: session!.id, message: err.message },
      })
    })

    return c.json({
      status: 'ok',
      message: 'prompt accepted',
      sessionId: session.id,
    })
  })

  app.get('/messages', (c) => {
    const session = service.vitamin.sessionManager.active
    if (!session) {
      return c.json([])
    }
    // TODO
    // @ts-ignore
    return c.json(serializeMessages(session))
  })

  app.post('/interrupt', (c) => {
    const session = service.vitamin.sessionManager.active
    if (!session) {
      return c.json({ status: 'error', message: 'no active session' }, 404)
    }
    session.abort()
    return c.json({ status: 'ok', message: 'interrupted' })
  })

  app.delete('/clear', async (c) => {
    const session = service.vitamin.sessionManager.active
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
    toolCalls: msg.content?.filter?.((b: any) => b.type === 'tool_call') ?? [],
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

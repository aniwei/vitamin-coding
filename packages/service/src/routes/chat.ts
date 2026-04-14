import { Hono } from 'hono'
import { serializeSessionMessages } from '../message-serializer'
import type { CodingService } from '../coding-service'

export function createChatRoute(service: CodingService): Hono {
  const app = new Hono()

  app.post('/query', async (c) => {
    const body = await c.req.json<{ message: string; sessionId?: string }>()
    const { message, sessionId } = body

    if (!message) {
      return c.json({ status: 'error', message: 'message is required' }, 400)
    }

    const session = sessionId ? service.getSession(sessionId) : service.getActiveSession()

    if (!session) {
      return c.json({ status: 'error', message: 'no active session' }, 404)
    }

    session.prompt(message).catch((err: Error) => {
      service.ws.sendToSession(session.id, {
        type: 'Runtime.error',
        data: { sessionId: session.id, message: err.message },
      })
    })

    return c.json({
      status: 'ok',
      message: 'prompt accepted',
      sessionId: session.id,
    })
  })

  app.get('/messages', (c) => {
    const session = service.getActiveSession()
    if (!session) {
      return c.json([])
    }
    return c.json(serializeSessionMessages(session))
  })

  app.post('/interrupt', (c) => {
    const session = service.getActiveSession()
    if (!session) {
      return c.json({ status: 'error', message: 'no active session' }, 404)
    }
    session.abort()
    return c.json({ status: 'ok', message: 'interrupted' })
  })

  app.delete('/clear', async (c) => {
    const session = service.getActiveSession()
    if (!session) {
      return c.json({ status: 'error', message: 'no active session' }, 404)
    }
    await session.compact('', session.session.messages().length)
    return c.json({ status: 'ok', message: 'cleared' })
  })

  return app
}

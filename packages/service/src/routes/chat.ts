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

  app.post('/tasks/:id/cancel', async (c) => {
    const taskId = c.req.param('id')
    const tool = service.xMars.toolRegistry.get('task_update')
    if (!tool) {
      return c.json({ status: 'error', message: 'task_update not available' }, 503)
    }

    const result = await tool.execute({
      id: `cancel-${taskId}`,
      params: { id: taskId, action: 'cancel' },
      signal: c.req.raw.signal,
    })
    const text = result.content.find((item) => item.type === 'text')?.text ?? 'cancel requested'
    if (result.isError) {
      return c.json({ status: 'error', message: text }, 400)
    }

    return c.json({ status: 'ok', message: text, taskId })
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

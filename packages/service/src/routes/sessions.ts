import { Hono } from 'hono'
import { serializeSessionMessages } from '../message-serializer'
import type { CodingService } from '../coding-service'

export function createSessionsRoute(context: CodingService): Hono {
  const app = new Hono()

  app.get('/', (c) => {
    const sessions = context.xMars.listSessions()
    return c.json(
      sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt?.toISOString(),
        messageCount: s.messageCount,
        workingDirectory: context.xMars.workspaceDir,
        title: s.model ?? s.id,
        status: s.status,
      })),
    )
  })

  app.post('/', async (c) => {
    await c.req.json<{ workingDirectory?: string }>().catch(() => ({}))
    const session = await context.xMars.createSession()
    return c.json({
      status: 'ok',
      message: 'session created',
      session: {
        id: session.id,
        workingDirectory: context.xMars.workspaceDir,
        createdAt: new Date().toISOString(),
      },
    })
  })

  app.get('/current', (c) => {
    const session = context.getActiveSession()
    if (!session) {
      return c.json({ status: 'error', message: 'no active session' }, 404)
    }
    return c.json({
      id: session.id,
      workingDirectory: context.xMars.workspaceDir,
      messageCount: session.session.messages().length,
      status: session.status,
    })
  })

  app.get('/current/context', (c) => {
    const session = context.getActiveSession()
    if (!session) {
      return c.json({ status: 'error', message: 'no active session' }, 404)
    }
    return c.json(
      session.getContextDiagnostics({
        includePrompt: c.req.query('includePrompt') === 'true',
      }),
    )
  })

  app.get('/bridge-info', (c) => {
    const session = context.getActiveSession()
    return c.json({
      bridgeMode: false,
      sessionId: session?.id ?? null,
    })
  })

  app.get('/:id/messages', (c) => {
    const session = context.getSession(c.req.param('id'))
    if (!session) {
      return c.json([], 404)
    }
    return c.json(serializeSessionMessages(session))
  })

  app.get('/:id/context', (c) => {
    const session = context.getSession(c.req.param('id'))
    if (!session) {
      return c.json({ status: 'error', message: 'session not found' }, 404)
    }
    return c.json(
      session.getContextDiagnostics({
        includePrompt: c.req.query('includePrompt') === 'true',
      }),
    )
  })

  app.post('/:id/resume', (c) => {
    const session = context.getSession(c.req.param('id'))
    if (!session) {
      return c.json({ status: 'error', message: 'session not found' }, 404)
    }
    return c.json({ status: 'ok', message: 'resumed', sessionId: session.id })
  })

  app.get('/:id/export', (c) => {
    const session = context.getSession(c.req.param('id'))
    if (!session) {
      return c.json({ status: 'error', message: 'session not found' }, 404)
    }
    return c.json({
      id: session.id,
      messages: session.session.messages(),
      exportedAt: new Date().toISOString(),
    })
  })

  app.get('/:id/model', (c) => {
    const session = context.getSession(c.req.param('id'))
    if (!session) {
      return c.json({}, 404)
    }
    const model = session.model
    return c.json(model ? { id: model.id, provider: model.provider } : {})
  })

  app.put('/:id/model', async (c) => {
    await c.req.json()
    return c.json({ status: 'ok', message: 'model overlay updated' })
  })

  app.delete('/:id/model', (_c) => {
    return _c.json({ status: 'ok', message: 'model overlay cleared' })
  })

  return app
}

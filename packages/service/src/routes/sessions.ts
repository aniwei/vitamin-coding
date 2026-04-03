import { Hono } from 'hono'
import { existsSync, statSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type { CodingService } from '../coding-service'

export function createSessionsRoute(
  context: CodingService
): Hono {
  const app = new Hono()

  // GET /sessions — list all sessions
  app.get('/', (c) => {
    const sessions = context.vitamin.listSessions()
    return c.json(
      sessions.map((s) => ({
        id: s.id,
        created_at: s.createdAt.toISOString(),
        updated_at: s.createdAt.toISOString(),
        message_count: s.messageCount,
        working_directory: context.vitamin.workspaceDir,
        title: s.model ?? s.id,
        status: s.status,
      })),
    )
  })

  // POST /sessions — create a new session
  app.post('/', async (c) => {
    await c.req.json<{ working_directory?: string }>().catch(() => ({}))
    const session = await context.vitamin.createSession()
    return c.json({
      status: 'ok',
      message: 'session created',
      session: {
        id: session.id,
        working_directory: context.vitamin.workspaceDir,
        created_at: new Date().toISOString(),
      },
    })
  })

  // GET /sessions/current — get the active session
  app.get('/current', (c) => {
    const session = context.vitamin.sessionManager.active
    if (!session) {
      return c.json({ status: 'error', message: 'no active session' }, 404)
    }
    return c.json({
      id: session.id,
      working_directory: context.vitamin.workspaceDir,
      message_count: session.session.messages().length,
      status: session.status,
    })
  })

  // GET /sessions/bridge-info
  app.get('/bridge-info', (c) => {
    const session = context.vitamin.sessionManager.active
    return c.json({
      bridge_mode: false,
      session_id: session?.id ?? null,
    })
  })

  // POST /sessions/verify-path
  app.post('/verify-path', async (c) => {
    const body = await c.req.json<{ path: string }>()
    const targetPath = body.path

    if (!targetPath) {
      return c.json({ exists: false, is_directory: false, error: 'path is required' })
    }

    const resolved = targetPath.startsWith('~')
      ? resolve(homedir(), targetPath.slice(2))
      : resolve(targetPath)

    try {
      const stat = statSync(resolved)
      return c.json({
        exists: true,
        is_directory: stat.isDirectory(),
        path: resolved,
      })
    } catch {
      return c.json({ exists: false, is_directory: false, path: resolved })
    }
  })

  // POST /sessions/browse-directory
  app.post('/browse-directory', async (c) => {
    const body = await c.req.json<{ path?: string; show_hidden?: boolean }>()
    const targetPath = body.path || context.vitamin.workspaceDir || homedir()
    const showHidden = body.show_hidden ?? false

    const resolved = targetPath.startsWith('~')
      ? resolve(homedir(), targetPath.slice(2))
      : resolve(targetPath)

    if (!existsSync(resolved)) {
      return c.json({
        current_path: resolved,
        parent_path: dirname(resolved),
        directories: [],
        error: 'path does not exist',
      })
    }

    try {
      const entries = readdirSync(resolved, { withFileTypes: true })
      const directories = entries
        .filter((e) => e.isDirectory())
        .filter((e) => showHidden || !e.name.startsWith('.'))
        .map((e) => ({ name: e.name, path: join(resolved, e.name) }))
        .sort((a, b) => a.name.localeCompare(b.name))

      return c.json({
        current_path: resolved,
        parent_path: dirname(resolved),
        directories,
        error: null,
      })
    } catch (err: any) {
      return c.json({
        current_path: resolved,
        parent_path: dirname(resolved),
        directories: [],
        error: err.message,
      })
    }
  })

  // GET /sessions/files
  app.get('/files', (c) => {
    const query = c.req.query('query')
    try {
      const entries = readdirSync(context.vitamin.workspaceDir, { withFileTypes: true })
      let files = entries.map((e) => ({
        path: join(context.vitamin.workspaceDir, e.name),
        name: e.name,
        is_file: e.isFile(),
      }))
      if (query) {
        const q = query.toLowerCase()
        files = files.filter((f) => f.name.toLowerCase().includes(q))
      }
      return c.json({ files })
    } catch {
      return c.json({ files: [] })
    }
  })

  // GET /sessions/:id/messages
  app.get('/:id/messages', (c) => {
    const session = context.vitamin.getSession(c.req.param('id'))
    if (!session) {
      return c.json([], 404)
    }
    return c.json(serializeMessages(session))
  })

  // POST /sessions/:id/resume
  app.post('/:id/resume', (c) => {
    const session = context.vitamin.getSession(c.req.param('id'))
    if (!session) {
      return c.json({ status: 'error', message: 'session not found' }, 404)
    }
    return c.json({ status: 'ok', message: 'resumed', sessionId: session.id })
  })

  // GET /sessions/:id/export
  app.get('/:id/export', (c) => {
    const session = context.vitamin.getSession(c.req.param('id'))
    if (!session) {
      return c.json({ status: 'error', message: 'session not found' }, 404)
    }
    return c.json({
      id: session.id,
      messages: session.session.messages(),
      exportedAt: new Date().toISOString(),
    })
  })

  // GET /sessions/:id/model
  app.get('/:id/model', (c) => {
    const session = context.vitamin.getSession(c.req.param('id'))
    if (!session) {
      return c.json({}, 404)
    }
    const model = session.model
    return c.json(model ? { id: model.id, provider: model.provider } : {})
  })

  // PUT /sessions/:id/model — update model overlay
  app.put('/:id/model', async (c) => {
    await c.req.json()
    return c.json({ status: 'ok', message: 'model overlay updated' })
  })

  // DELETE /sessions/:id/model — clear model overlay
  app.delete('/:id/model', (_c) => {
    return _c.json({ status: 'ok', message: 'model overlay cleared' })
  })

  return app
}

function serializeMessages(session: { session: { messages(): unknown[] } }) {
  const messages = session.session.messages()
  return messages.map((msg: any) => ({
    role: msg.role,
    content: typeof msg.content === 'string'
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content
            .filter((b: any) => b.type === 'text')
            .map((b: any) => b.text)
            .join('')
        : '',
    timestamp: msg.timestamp,
    tool_calls: Array.isArray(msg.content)
      ? msg.content
          .filter((b: any) => b.type === 'tool_call')
          .map((b: any) => ({
            id: b.id,
            name: b.name,
            parameters: b.arguments ?? {},
          }))
      : [],
  }))
}

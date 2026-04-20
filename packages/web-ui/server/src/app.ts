import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { mount } from './routes'

import type { Session, User } from 'better-auth/types'

export type AppEnv = {
  Variables: {
    session?: { session: Session; user: User & { role?: string } }
  }
}

export function createApp() {
  const app = new Hono<AppEnv>()

  app.use('*', logger())
  app.use('*', cors({
    origin: (origin) => origin ?? '*',
    credentials: true,
  }))

  app.get('/ping', (c) => c.text('pong'))
  app.get('/health', (c) => c.json({ ok: true }))

  mount(app)

  app.notFound((c) => c.json({ error: 'Not Found' }, 404))
  app.onError((err, c) => {
    console.error('[server]', err)
    return c.json({ error: err.message ?? 'Internal Server Error' }, 500)
  })

  return app
}

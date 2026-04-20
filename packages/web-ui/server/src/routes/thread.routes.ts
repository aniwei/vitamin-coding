import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { requireAuth } from '../middleware/require-auth'
import { chatRepository } from '../../../src/lib/db/repository'

export const threadRoutes = new Hono<AppEnv>()
threadRoutes.use('/*', requireAuth)

/** GET /api/thread */
threadRoutes.get('/', async (c) => {
  const session = c.get('session')!
  const threads = await chatRepository.selectThreadsByUserId(session.user.id)
  return c.json(threads)
})

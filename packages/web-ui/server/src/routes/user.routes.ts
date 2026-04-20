import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { requireAuth } from '../middleware/require-auth'
import { chatRepository } from '../../../src/lib/db/repository'
import { userRepository } from '../../../src/lib/db/repository'
import { getUser, getUserAccounts, getUserSessions } from '../services/user.service'
import { UserPreferencesZodSchema } from 'app-types/user'
import { canManageUser } from '../middleware/permissions'

export const userRoutes = new Hono<AppEnv>()

userRoutes.use('/*', requireAuth)

/** GET /api/user/details — 当前用户详情 */
userRoutes.get('/details', async (c) => {
  try {
    const session = c.get('session')!
    const user = await getUser(c.req.raw.headers, session.user.id)
    return c.json(user ?? {})
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to get user details' }, 500)
  }
})

/** GET /api/user/details/:id — 指定用户详情（需 canManageUser 权限） */
userRoutes.get('/details/:id', async (c) => {
  try {
    const session = c.get('session')!
    const { id } = c.req.param()
    const allowed = canManageUser(id, session)
    if (!allowed) return c.json({ error: 'Forbidden' }, 403)
    const user = await getUser(c.req.raw.headers, id)
    return c.json(user ?? {})
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to get user details' }, 500)
  }
})

/** GET /api/user/preferences */
userRoutes.get('/preferences', async (c) => {
  try {
    const session = c.get('session')!
    const preferences = await userRepository.getPreferences(session.user.id)
    return c.json(preferences ?? {})
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to get preferences' }, 500)
  }
})

/** PUT /api/user/preferences */
userRoutes.put('/preferences', async (c) => {
  try {
    const session = c.get('session')!
    const json = await c.req.json()
    const preferences = UserPreferencesZodSchema.parse(json)
    const updatedUser = await userRepository.updatePreferences(session.user.id, preferences)
    return c.json({ success: true, preferences: updatedUser.preferences })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to update preferences' }, 500)
  }
})

/** GET /api/user/accounts */
userRoutes.get('/accounts', async (c) => {
  try {
    const session = c.get('session')!
    const result = await getUserAccounts(c.req.raw.headers, session.user.id)
    return c.json(result)
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to get accounts' }, 500)
  }
})

/** GET /api/user/sessions */
userRoutes.get('/sessions', async (c) => {
  try {
    const session = c.get('session')!
    const sessions = await getUserSessions(c.req.raw.headers, session.user.id)
    return c.json(sessions)
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to get sessions' }, 500)
  }
})

/** GET /api/user/stats */
userRoutes.get('/stats', async (c) => {
  try {
    const session = c.get('session')!
    const threads = await chatRepository.selectThreadsByUserId(session.user.id)
    return c.json({ threadCount: threads.length })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to get stats' }, 500)
  }
})

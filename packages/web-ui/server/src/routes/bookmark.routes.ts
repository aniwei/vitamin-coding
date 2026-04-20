import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app'
import { requireAuth } from '../middleware/require-auth'
import { bookmarkRepository } from '../../../src/lib/db/repository'

export const bookmarkRoutes = new Hono<AppEnv>()
bookmarkRoutes.use('/*', requireAuth)

const BookmarkSchema = z.object({
  itemId: z.string().min(1),
  itemType: z.enum(['agent', 'workflow']),
})

/** POST /api/bookmark */
bookmarkRoutes.post('/', async (c) => {
  const session = c.get('session')!
  try {
    const body = await c.req.json()
    const { itemId, itemType } = BookmarkSchema.parse(body)
    const hasAccess = await bookmarkRepository.checkItemAccess(itemId, itemType, session.user.id)
    if (!hasAccess) return c.json({ error: 'Item not found or access denied' }, 404)
    await bookmarkRepository.createBookmark(session.user.id, itemId, itemType)
    return c.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.message }, 400)
    return c.json({ error: 'Failed to create bookmark' }, 500)
  }
})

/** DELETE /api/bookmark */
bookmarkRoutes.delete('/', async (c) => {
  const session = c.get('session')!
  try {
    const body = await c.req.json()
    const { itemId, itemType } = BookmarkSchema.parse(body)
    await bookmarkRepository.removeBookmark(session.user.id, itemId, itemType)
    return c.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.message }, 400)
    return c.json({ error: 'Failed to remove bookmark' }, 500)
  }
})

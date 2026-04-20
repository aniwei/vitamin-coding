import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app'
import { requireAuth } from '../middleware/require-auth'
import { archiveRepository } from '../../../src/lib/db/repository'
import { ArchiveCreateSchema, ArchiveUpdateSchema } from 'app-types/archive'

export const archiveRoutes = new Hono<AppEnv>()
archiveRoutes.use('/*', requireAuth)

/** GET /api/archive */
archiveRoutes.get('/', async (c) => {
  const session = c.get('session')!
  try {
    const archives = await archiveRepository.getArchivesByUserId(session.user.id)
    return c.json(archives)
  } catch (error) {
    console.error('Failed to fetch archives:', error)
    return c.text('Internal Server Error', 500)
  }
})

/** POST /api/archive */
archiveRoutes.post('/', async (c) => {
  const session = c.get('session')!
  try {
    const body = await c.req.json()
    const data = ArchiveCreateSchema.parse(body)
    const archive = await archiveRepository.createArchive({
      name: data.name,
      description: data.description || null,
      userId: session.user.id,
    })
    return c.json(archive)
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.message }, 400)
    console.error('Failed to create archive:', error)
    return c.json({ message: 'Internal Server Error' }, 500)
  }
})

/** GET /api/archive/:id */
archiveRoutes.get('/:id', async (c) => {
  const session = c.get('session')!
  const { id } = c.req.param()
  try {
    const archive = await archiveRepository.getArchiveById(id)
    if (!archive) return c.json({ error: 'Archive not found' }, 404)
    if (archive.userId !== session.user.id) return c.text('Forbidden', 403)
    const items = await archiveRepository.getArchiveItems(id)
    return c.json({ ...archive, items })
  } catch (error) {
    return c.text('Internal Server Error', 500)
  }
})

/** PUT /api/archive/:id */
archiveRoutes.put('/:id', async (c) => {
  const session = c.get('session')!
  const { id } = c.req.param()
  try {
    const existing = await archiveRepository.getArchiveById(id)
    if (!existing) return c.json({ error: 'Archive not found' }, 404)
    if (existing.userId !== session.user.id) return c.text('Forbidden', 403)
    const body = await c.req.json()
    const data = ArchiveUpdateSchema.parse(body)
    const archive = await archiveRepository.updateArchive(id, {
      name: data.name,
      description: data.description || null,
    })
    return c.json(archive)
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.message }, 400)
    return c.text('Internal Server Error', 500)
  }
})

/** DELETE /api/archive/:id */
archiveRoutes.delete('/:id', async (c) => {
  const session = c.get('session')!
  const { id } = c.req.param()
  const archive = await archiveRepository.getArchiveById(id)
  if (!archive) return c.json({ error: 'Archive not found' }, 404)
  if (archive.userId !== session.user.id) return c.text('Forbidden', 403)
  await archiveRepository.deleteArchive(id)
  return c.json({ success: true })
})

/** GET /api/archive/:id/items */
archiveRoutes.get('/:id/items', async (c) => {
  const session = c.get('session')!
  const { id } = c.req.param()
  try {
    const archive = await archiveRepository.getArchiveById(id)
    if (!archive) return c.json({ error: 'Archive not found' }, 404)
    if (archive.userId !== session.user.id) return c.text('Forbidden', 403)
    const items = await archiveRepository.getArchiveItems(id)
    return c.json(items)
  } catch (error) {
    return c.text('Internal Server Error', 500)
  }
})

/** POST /api/archive/:id/items */
archiveRoutes.post('/:id/items', async (c) => {
  const session = c.get('session')!
  const { id } = c.req.param()
  try {
    const archive = await archiveRepository.getArchiveById(id)
    if (!archive) return c.json({ error: 'Archive not found' }, 404)
    if (archive.userId !== session.user.id) return c.text('Forbidden', 403)
    const body = await c.req.json()
    const { itemId } = z.object({ itemId: z.string() }).parse(body)
    const item = await archiveRepository.addItemToArchive(id, itemId, session.user.id)
    return c.json(item)
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.message }, 400)
    return c.json({ message: 'Internal Server Error' }, 500)
  }
})

/** DELETE /api/archive/:id/items/:itemId */
archiveRoutes.delete('/:id/items/:itemId', async (c) => {
  const session = c.get('session')!
  const { id, itemId } = c.req.param()
  try {
    const archive = await archiveRepository.getArchiveById(id)
    if (!archive) return c.json({ error: 'Archive not found' }, 404)
    if (archive.userId !== session.user.id) return c.text('Forbidden', 403)
    const items = await archiveRepository.getArchiveItems(id)
    if (!items.some((item) => item.itemId === itemId))
      return c.json({ error: 'Item not found in archive' }, 404)
    await archiveRepository.removeItemFromArchive(id, itemId)
    return c.json({ success: true })
  } catch (error) {
    return c.text('Internal Server Error', 500)
  }
})

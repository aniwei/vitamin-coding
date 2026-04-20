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

/** GET /api/thread/:id — thread with messages */
threadRoutes.get('/:id', async (c) => {
  const session = c.get('session')!
  const { id } = c.req.param()
  try {
    const hasAccess = await chatRepository.checkAccess(id, session.user.id)
    if (!hasAccess) return c.json({ error: 'Not found' }, 404)
    const thread = await chatRepository.selectThread(id)
    if (!thread) return c.json({ error: 'Not found' }, 404)
    const messages = await chatRepository.selectMessagesByThreadId(id)
    return c.json({ ...thread, messages: messages ?? [] })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to get thread' }, 500)
  }
})

/** DELETE /api/thread/:id */
threadRoutes.delete('/:id', async (c) => {
  const session = c.get('session')!
  const { id } = c.req.param()
  try {
    const hasAccess = await chatRepository.checkAccess(id, session.user.id)
    if (!hasAccess) return c.json({ error: 'Forbidden' }, 403)
    await chatRepository.deleteThread(id)
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to delete thread' }, 500)
  }
})

/** DELETE /api/thread — 删除当前用户所有会话 */
threadRoutes.delete('/', async (c) => {
  const session = c.get('session')!
  try {
    await chatRepository.deleteAllThreads(session.user.id)
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to delete threads' }, 500)
  }
})

/** PUT /api/thread/:id */
threadRoutes.put('/:id', async (c) => {
  const session = c.get('session')!
  const { id } = c.req.param()
  try {
    const hasAccess = await chatRepository.checkAccess(id, session.user.id)
    if (!hasAccess) return c.json({ error: 'Forbidden' }, 403)
    const body = await c.req.json()
    const updated = await chatRepository.updateThread(id, { ...body, userId: session.user.id })
    return c.json(updated)
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to update thread' }, 500)
  }
})

/** POST /api/thread/delete-unarchived — 删除未归档的会话 */
threadRoutes.post('/delete-unarchived', async (c) => {
  const session = c.get('session')!
  try {
    await chatRepository.deleteUnarchivedThreads(session.user.id)
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to delete unarchived threads' }, 500)
  }
})

/** DELETE /api/thread/:id/messages — 删除指定 message 之后的消息 */
threadRoutes.delete('/:threadId/messages/:messageId', async (c) => {
  try {
    const { messageId } = c.req.param()
    await chatRepository.deleteMessagesByChatIdAfterTimestamp(messageId)
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to delete messages' }, 500)
  }
})

/** DELETE /api/thread/messages/:messageId — 删除单条消息 */
threadRoutes.delete('/messages/:messageId', async (c) => {
  try {
    const { messageId } = c.req.param()
    await chatRepository.deleteChatMessage(messageId)
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to delete message' }, 500)
  }
})

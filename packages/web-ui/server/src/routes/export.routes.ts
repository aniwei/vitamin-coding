import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { getSession } from '../auth'
import { chatExportRepository } from '../../../src/lib/db/repository'
import { ChatExportCommentCreateSchema } from 'app-types/chat-export'

export const exportRoutes = new Hono<AppEnv>()

// /api/export 下，GET 不需要强制登录（可公开查看）

/** GET /api/export — 获取当前用户的导出列表 */
exportRoutes.get('/', async (c) => {
  try {
    const session = await getSession(c.req.raw.headers)
    if (!session?.user?.id) return c.json({ error: 'Unauthorized' }, 401)
    const exports = await chatExportRepository.selectSummaryByExporterId(session.user.id)
    return c.json(exports)
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to get exports' }, 500)
  }
})

/** DELETE /api/export/:id */
exportRoutes.delete('/:id', async (c) => {
  const { id } = c.req.param()
  try {
    const session = await getSession(c.req.raw.headers)
    if (!session?.user?.id) return c.json({ error: 'Unauthorized' }, 401)
    const hasAccess = await chatExportRepository.checkAccess(id, session.user.id)
    if (!hasAccess) return c.json({ error: 'Forbidden' }, 403)
    await chatExportRepository.deleteById(id)
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to delete export' }, 500)
  }
})

/** GET /api/export/:id — 获取单条导出详情（公开，不需登录） */
exportRoutes.get('/:id', async (c) => {
  const { id } = c.req.param()
  try {
    const isExpired = await chatExportRepository.isExpired(id)
    if (isExpired) return c.json({ error: 'Export has expired' }, 410)
    const thread = await chatExportRepository.selectByIdWithUser(id)
    if (!thread) return c.json({ error: 'Export not found' }, 404)
    const session = await getSession(c.req.raw.headers)
    const userId = session?.user?.id
    const comments = userId ? await chatExportRepository.selectCommentsByExportId(id, userId) : []
    return c.json({ thread, comments })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to get export' }, 500)
  }
})

/** GET /api/export/:id/comments */
exportRoutes.get('/:id/comments', async (c) => {
  const { id } = c.req.param()
  try {
    const session = await getSession(c.req.raw.headers)
    const userId = session?.user?.id
    const comments = await chatExportRepository.selectCommentsByExportId(id, userId)
    return c.json(comments)
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to get comments' }, 500)
  }
})

/** POST /api/export/:id/comments */
exportRoutes.post('/:id/comments', async (c) => {
  const { id } = c.req.param()
  try {
    const session = await getSession(c.req.raw.headers)
    if (!session?.user?.id) return c.json({ error: 'Unauthorized' }, 401)
    const body = await c.req.json()
    const data = ChatExportCommentCreateSchema.parse({
      exportId: id,
      authorId: session.user.id,
      parentId: body.parentId,
      content: body.content,
    })
    await chatExportRepository.insertComment(data)
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to create comment' }, 500)
  }
})

/** DELETE /api/export/:id/comments/:commentId */
exportRoutes.delete('/:id/comments/:commentId', async (c) => {
  const { commentId } = c.req.param()
  try {
    const session = await getSession(c.req.raw.headers)
    if (!session?.user?.id) return c.json({ error: 'Unauthorized' }, 401)
    const hasAccess = await chatExportRepository.checkCommentAccess(commentId, session.user.id)
    if (!hasAccess) return c.json({ error: 'Forbidden' }, 403)
    await chatExportRepository.deleteComment(commentId, session.user.id)
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to delete comment' }, 500)
  }
})

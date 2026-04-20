/**
 * admin.routes.ts —— Hono 版管理员路由
 *
 * 对应原 Next.js Server Actions（src/app/api/admin/actions.ts）+ Server Component 数据加载
 * 将 React Server Actions 转换为标准 REST HTTP 接口：
 *   GET  /api/admin/users          — 分页获取用户列表（仅管理员）
 *   PUT  /api/admin/users/:id/role — 更新用户角色
 *   PUT  /api/admin/users/:id/ban  — 封禁 / 解封用户
 */
import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { requireAdmin } from '../middleware/require-auth'
import { auth } from '../auth'
import { DEFAULT_USER_ROLE, userRolesInfo } from 'app-types/roles'
import { UpdateUserRoleSchema, UpdateUserBanStatusSchema } from '../../../src/app/api/admin/validations'
import pgAdminRepository from '../../../src/lib/db/pg/repositories/admin-respository.pg'
import { userRepository } from 'lib/db/repository'
import type { AdminUsersQuery } from 'app-types/admin'
import logger from 'logger'

export const adminRoutes = new Hono<AppEnv>()

adminRoutes.use('/*', requireAdmin)

/** GET /api/admin/users */
adminRoutes.get('/users', async (c) => {
  const { page, limit, query, sortBy, sortDirection } = c.req.query()
  const pageNum = parseInt(page ?? '1', 10)
  const limitNum = parseInt(limit ?? '10', 10)
  const offset = (pageNum - 1) * limitNum

  const q: AdminUsersQuery = {
    searchValue: query,
    searchField: 'email',
    searchOperator: 'contains',
    limit: limitNum,
    offset,
    sortBy: sortBy ?? 'createdAt',
    sortDirection: (sortDirection as 'asc' | 'desc') ?? 'desc',
  }

  try {
    const result = await pgAdminRepository.getUsers(q)
    return c.json(result)
  } catch (error) {
    logger.error(error)
    return c.json({ error: 'Failed to fetch users' }, 500)
  }
})

/** PUT /api/admin/users/:id/role */
adminRoutes.put('/users/:id/role', async (c) => {
  const session = c.get('session')!
  const targetId = c.req.param('id')
  const body = await c.req.json()

  const parsed = UpdateUserRoleSchema.safeParse({ userId: targetId, ...body })
  if (!parsed.success) {
    return c.json({ success: false, message: 'Invalid request', errors: parsed.error.flatten() }, 400)
  }

  const { userId, role: roleInput } = parsed.data
  const role = roleInput || DEFAULT_USER_ROLE

  if (session.user.id === userId) {
    return c.json({ success: false, message: 'Cannot update your own role' }, 400)
  }

  try {
    await (auth.api as any).setRole({
      body: { userId, role: role as 'user' | 'admin' },
      headers: c.req.raw.headers,
    })
    await (auth.api as any).revokeUserSessions({
      body: { userId },
      headers: c.req.raw.headers,
    })
    const user = await userRepository.getUserById(userId)
    if (!user) {
      return c.json({ success: false, message: 'User not found' }, 404)
    }
    return c.json({
      success: true,
      message: `Role updated to ${userRolesInfo[role]?.label ?? role}`,
      user,
    })
  } catch (error) {
    logger.error(error)
    return c.json({ success: false, message: 'Failed to update role' }, 500)
  }
})

/** PUT /api/admin/users/:id/ban */
adminRoutes.put('/users/:id/ban', async (c) => {
  const session = c.get('session')!
  const targetId = c.req.param('id')
  const body = await c.req.json()

  const parsed = UpdateUserBanStatusSchema.safeParse({ userId: targetId, ...body })
  if (!parsed.success) {
    return c.json({ success: false, message: 'Invalid request', errors: parsed.error.flatten() }, 400)
  }

  const { userId, banned, banReason } = parsed.data

  if (session.user.id === userId) {
    return c.json({ success: false, message: 'Cannot ban/unban yourself' }, 400)
  }

  try {
    if (!banned) {
      await (auth.api as any).banUser({
        body: { userId, banReason: banReason || 'Banned by admin' },
        headers: c.req.raw.headers,
      })
      await (auth.api as any).revokeUserSessions({
        body: { userId },
        headers: c.req.raw.headers,
      })
    } else {
      await (auth.api as any).unbanUser({
        body: { userId },
        headers: c.req.raw.headers,
      })
    }

    const user = await userRepository.getUserById(userId)
    if (!user) {
      return c.json({ success: false, message: 'User not found' }, 404)
    }

    return c.json({
      success: true,
      message: (user as any).banned ? 'User banned successfully' : 'User unbanned successfully',
      user,
    })
  } catch (error) {
    logger.error(error)
    return c.json({ success: false, message: 'Failed to update ban status' }, 500)
  }
})

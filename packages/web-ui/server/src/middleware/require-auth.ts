import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../app'
import { getSession } from '../auth'

/** 校验登录态，将 session 注入 c.var.session；未登录返回 401。*/
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await getSession(c.req.raw.headers)
  if (!session) return c.json({ error: 'Unauthorized' }, 401)
  c.set('session', session as any)
  await next()
}

/** 校验管理员权限；依赖 requireAuth 先执行。*/
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = c.get('session') as Awaited<ReturnType<typeof getSession>>
  if (!session) return c.json({ error: 'Unauthorized' }, 401)
  const role = (session.user as any).role
  if (role !== 'admin') return c.json({ error: 'Forbidden' }, 403)
  await next()
}


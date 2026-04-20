import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { auth } from '../auth'

/**
 * 挂载 better-auth 的所有鉴权端点。
 * 替代 src/app/api/auth/[...all]/route.ts 中的 toNextJsHandler。
 */
export const authRoutes = new Hono<AppEnv>()

authRoutes.on(['GET', 'POST'], '/*', (c) => auth.handler(c.req.raw))

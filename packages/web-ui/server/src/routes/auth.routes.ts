import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { auth } from '../auth'
import { getAuthConfig } from '../../../src/lib/auth/config'
import { getIsFirstUser } from '../../../src/lib/auth/auth-instance'
import { userRepository } from '../../../src/lib/db/repository'

/**
 * 挂载 better-auth 的所有鉴权端点。
 * 替代 src/app/api/auth/[...all]/route.ts 中的 toNextJsHandler。
 */
export const authRoutes = new Hono<AppEnv>()

/** GET /api/auth/config — 客户端读取认证配置（社交登录列表、是否首个用户等） */
authRoutes.get('/config', async (c) => {
  const { emailAndPasswordEnabled, signUpEnabled, socialAuthenticationProviders } = getAuthConfig()
  const enabledProviders = (
    Object.keys(socialAuthenticationProviders) as (keyof typeof socialAuthenticationProviders)[]
  ).filter((key) => socialAuthenticationProviders[key])
  const isFirstUser = await getIsFirstUser()
  return c.json({ emailAndPasswordEnabled, signUpEnabled, socialAuthenticationProviders: enabledProviders, isFirstUser })
})

/** GET /api/auth/email-exists?email=... — 检查邮箱是否已注册（注册步骤用） */
authRoutes.get('/email-exists', async (c) => {
  const email = c.req.query('email')
  if (!email) return c.json({ exists: false })
  const exists = await userRepository.existsByEmail(email)
  return c.json({ exists })
})

authRoutes.on(['GET', 'POST'], '/*', (c) => auth.handler(c.req.raw))

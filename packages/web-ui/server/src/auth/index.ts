/**
 * better-auth 实例 —— Hono 版
 * 替代 src/lib/auth/auth-instance.ts，去除：
 *   - nextCookies() 插件
 *   - headers() from next/headers
 *   - server-only 依赖
 */
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin as adminPlugin } from 'better-auth/plugins'
import { pgDb } from 'lib/db/pg/db.pg'
import {
  AccountTable,
  SessionTable,
  UserTable,
  VerificationTable,
} from 'lib/db/pg/schema.pg'
import { getAuthConfig } from 'lib/auth/config'
import logger from 'logger'
import { userRepository } from 'lib/db/repository'
import { DEFAULT_USER_ROLE, USER_ROLES } from 'app-types/roles'
import { admin, editor, user, ac } from 'lib/auth/roles'

const { emailAndPasswordEnabled, signUpEnabled, socialAuthenticationProviders } = getAuthConfig()

// Cache the first user check to avoid repeated DB queries
let isFirstUserCache: boolean | null = null

export const getIsFirstUser = async () => {
  if (isFirstUserCache === false) return false
  const count = await userRepository.getUserCount()
  if (count > 0) {
    isFirstUserCache = false
    return false
  }
  return true
}

const options = {
  secret: process.env.BETTER_AUTH_SECRET!,
  plugins: [
    adminPlugin({
      defaultRole: DEFAULT_USER_ROLE,
      adminRoles: [USER_ROLES.ADMIN],
      ac,
      roles: { admin, editor, user },
    }),
    // nextCookies() 已移除 —— 使用 better-auth 默认 cookie 行为
  ],
  baseURL: process.env.BETTER_AUTH_URL || process.env.VITE_BASE_URL,
  user: {
    changeEmail: { enabled: true },
    deleteUser: { enabled: true },
  },
  database: drizzleAdapter(pgDb, {
    provider: 'pg',
    schema: {
      user: UserTable,
      session: SessionTable,
      account: AccountTable,
      verification: VerificationTable,
    },
  }),
  databaseHooks: {
    user: {
      create: {
        before: async (user: any) => {
          const isFirstUser = await getIsFirstUser()
          const role = isFirstUser ? USER_ROLES.ADMIN : DEFAULT_USER_ROLE
          logger.info(
            `User creation hook: ${user.email} will get role: ${role} (isFirstUser: ${isFirstUser})`,
          )
          return { data: { ...user, role } }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: emailAndPasswordEnabled,
    disableSignUp: !signUpEnabled,
  },
  session: {
    cookieCache: { enabled: true, maxAge: 60 * 60 },
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    useSecureCookies: process.env.NO_HTTPS === '1' ? false : process.env.NODE_ENV === 'production',
    database: { generateId: false },
  },
  account: {
    accountLinking: {
      trustedProviders: (Object.keys(socialAuthenticationProviders) as string[]).filter(
        (key) => socialAuthenticationProviders[key as keyof typeof socialAuthenticationProviders],
      ) as any,
    },
  },
  socialProviders: socialAuthenticationProviders,
} satisfies BetterAuthOptions

export const auth = betterAuth({
  ...options,
  plugins: [...(options.plugins ?? [])],
})

/**
 * Hono 版 getSession —— 通过请求 headers 取得 session。
 * 在 Hono 中间件里调用：getSession(c.req.raw.headers)
 */
export async function getSession(headers: Headers) {
  try {
    const session = await auth.api.getSession({ headers })
    return session ?? null
  } catch (error) {
    logger.error('Error getting session:', error)
    return null
  }
}

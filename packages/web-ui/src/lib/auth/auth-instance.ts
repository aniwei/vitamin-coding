// Base auth instance without "server-only" - can be used in seed scripts
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { admin as adminPlugin } from 'better-auth/plugins'
import { pgDb } from 'lib/db/pg/db.pg'
import {
  AccountTable,
  SessionTable,
  UserTable,
  VerificationTable,
} from 'lib/db/pg/schema.pg'
import { getAuthConfig } from './config'
import logger from 'logger'
import { DEFAULT_USER_ROLE, USER_ROLES } from 'app-types/roles'
import { admin, editor, user, ac } from './roles'
import { eq } from 'drizzle-orm'

// ─── No-Auth Default User ───────────────────────────────────────────────────
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEFAULT_USER_EMAIL = 'admin@local.dev'
const DEFAULT_USER_NAME = 'Admin'

const DEFAULT_SESSION = {
  user: {
    id: DEFAULT_USER_ID,
    name: DEFAULT_USER_NAME,
    email: DEFAULT_USER_EMAIL,
    emailVerified: true,
    image: null as string | null,
    role: 'admin' as string,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    banned: null as boolean | null,
    banReason: null as string | null,
    banExpires: null as Date | null,
  },
  session: {
    id: 'no-auth-session',
    token: 'no-auth-token',
    userId: DEFAULT_USER_ID,
    expiresAt: new Date('2099-01-01'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ipAddress: null as string | null,
    userAgent: null as string | null,
    impersonatedBy: null as string | null,
  },
}

async function ensureDefaultUser() {
  try {
    const [existing] = await pgDb
      .select()
      .from(UserTable)
      .where(eq(UserTable.id, DEFAULT_USER_ID))
      .limit(1)
    if (existing) return existing
    const [created] = await pgDb
      .insert(UserTable)
      .values({
        id: DEFAULT_USER_ID,
        name: DEFAULT_USER_NAME,
        email: DEFAULT_USER_EMAIL,
        emailVerified: true,
        role: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning()
    return created ?? null
  } catch {
    return null
  }
}

const {
  emailAndPasswordEnabled,
  signUpEnabled,
  socialAuthenticationProviders,
} = getAuthConfig()

const options = {
  secret: process.env.BETTER_AUTH_SECRET!,
  plugins: [
    adminPlugin({
      defaultRole: DEFAULT_USER_ROLE,
      adminRoles: [USER_ROLES.ADMIN],
      ac,
      roles: {
        admin,
        editor,
        user,
      },
    }),
    nextCookies(),
  ],
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_BASE_URL,
  user: {
    changeEmail: {
      enabled: true,
    },
    deleteUser: {
      enabled: true,
    },
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
        before: async (user) => {
          // This hook ONLY runs during user creation (sign-up), not on sign-in
          // Use our optimized getIsFirstUser function with caching
          const isFirstUser = await getIsFirstUser()

          // Set role based on whether this is the first user
          const role = isFirstUser ? USER_ROLES.ADMIN : DEFAULT_USER_ROLE

          logger.info(
            `User creation hook: ${user.email} will get role: ${role} (isFirstUser: ${isFirstUser})`
          )

          return {
            data: {
              ...user,
              role,
            },
          }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: emailAndPasswordEnabled,
    disableSignUp: !signUpEnabled,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60,
    },
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day (every 1 day the session expiration is updated)
  },
  advanced: {
    useSecureCookies:
      process.env.NO_HTTPS == '1'
        ? false
        : process.env.NODE_ENV === 'production',
    database: {
      generateId: false,
    },
  },
  account: {
    accountLinking: {
      trustedProviders: (
        Object.keys(
          socialAuthenticationProviders
        ) as (keyof typeof socialAuthenticationProviders)[]
      ).filter((key) => socialAuthenticationProviders[key]),
    },
  },
  socialProviders: socialAuthenticationProviders,
} satisfies BetterAuthOptions

export const auth = betterAuth({
  ...options,
  plugins: [...(options.plugins ?? [])],
})

export const getSession = async () => {
  // Fire-and-forget: try to create default user in DB if possible
  ensureDefaultUser().catch(() => {})
  return DEFAULT_SESSION
}

export const getIsFirstUser = async () => false

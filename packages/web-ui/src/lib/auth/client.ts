'use client'

import { createAuthClient } from 'better-auth/react' // make sure to import from better-auth/react
import { adminClient, inferAdditionalFields } from 'better-auth/client/plugins'

import { DEFAULT_USER_ROLE, USER_ROLES } from 'app-types/roles'
import { ac, admin, editor, user } from './roles'
import type { auth } from './auth-instance'

const FIXED_SESSION = {
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Admin',
    email: 'admin@local.dev',
    emailVerified: true as const,
    image: null as string | null,
    role: 'admin',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    banned: null as boolean | null,
    banReason: null as string | null,
    banExpires: null as Date | null,
  },
  session: {
    id: 'no-auth-session',
    token: 'no-auth-token',
    userId: '00000000-0000-0000-0000-000000000001',
    expiresAt: new Date('2099-01-01'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ipAddress: null as string | null,
    userAgent: null as string | null,
    impersonatedBy: null as string | null,
  },
}

const _base = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    adminClient({
      defaultRole: DEFAULT_USER_ROLE,
      adminRoles: [USER_ROLES.ADMIN],
      ac,
      roles: {
        admin,
        editor,
        user,
      },
    }),
  ],
})

export const authClient = Object.assign(_base, {
  useSession: () => ({
    data: FIXED_SESSION,
    isPending: false,
    error: null,
    refetch: async () => ({ data: FIXED_SESSION }),
  }),
})

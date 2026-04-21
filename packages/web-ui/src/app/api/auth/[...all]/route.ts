import { auth } from 'auth/server'
import { toNextJsHandler } from 'better-auth/next-js'
import { NextRequest } from 'next/server'

const MOCK_SESSION = {
  session: {
    id: 'no-auth-session',
    token: 'no-auth-token',
    userId: '00000000-0000-0000-0000-000000000001',
    expiresAt: new Date('2099-01-01').toISOString(),
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
    ipAddress: null,
    userAgent: null,
    impersonatedBy: null,
  },
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Admin',
    email: 'admin@local.dev',
    emailVerified: true,
    image: null,
    role: 'admin',
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
    banned: null,
    banReason: null,
    banExpires: null,
  },
}

const _handler = toNextJsHandler(auth.handler)

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ all: string[] }> }
) {
  const { all } = await ctx.params
  if (all?.[0] === 'get-session') {
    return Response.json(MOCK_SESSION)
  }
  return _handler.GET(req, ctx)
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ all: string[] }> }
) {
  return _handler.POST(req, ctx)
}

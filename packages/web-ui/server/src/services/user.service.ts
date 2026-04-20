/**
 * Hono 版用户 service —— 替代 src/lib/user/server.ts 中依赖 next/headers 的部分。
 * 传入 Hono request headers，避免直接调用 next/headers。
 */
import { auth } from '../auth'
import { userRepository } from '../../../src/lib/db/repository'
import type { Session } from 'better-auth/types'

export async function getUser(headers: Headers, userId: string) {
  return await userRepository.getUserById(userId)
}

export async function getUserAccounts(headers: Headers, userId: string) {
  const accounts = await auth.api.listUserAccounts({
    params: { userId },
    headers,
  })
  const hasPassword = accounts.some((a) => a.providerId === 'credential')
  const oauthProviders = accounts
    .filter((a) => a.providerId !== 'credential')
    .map((a) => a.providerId)
  return { accounts, hasPassword, oauthProviders }
}

export async function getUserSessions(headers: Headers, userId: string): Promise<Session[]> {
  return await auth.api.listSessions({
    params: { userId },
    headers,
  })
}

export async function updateUserDetails(
  userId: string,
  name: string,
  email: string,
  image?: string | null,
) {
  return await userRepository.updateUserDetails({ userId, name, email, image: image ?? undefined })
}

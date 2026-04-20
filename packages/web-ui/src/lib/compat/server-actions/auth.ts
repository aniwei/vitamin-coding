/**
 * Compat shim for @/app/api/auth/actions (server actions → fetch + authClient)
 */
import { authClient } from 'auth/client'
import type { BasicUser } from 'app-types/user'

export async function existsByEmailAction(email: string): Promise<boolean> {
  const res = await fetch(`/api/auth/email-exists?email=${encodeURIComponent(email)}`)
  if (!res.ok) return false
  const data = await res.json()
  return data.exists === true
}

type SignUpActionResponse = {
  success: boolean
  message: string
  user?: BasicUser
}

export async function signUpAction(data: {
  email: string
  name: string
  password: string
}): Promise<SignUpActionResponse> {
  const { data: user, error } = await authClient.signUp.email(data as any)
  if (error) {
    return { success: false, message: error.message || 'Failed to sign up' }
  }
  return { success: true, message: 'Successfully signed up', user: user as any }
}

/** Get current user id (used in export page) */
export async function getUserId(): Promise<string | undefined> {
  const sessionData = await authClient.getSession()
  return sessionData?.data?.user?.id
}

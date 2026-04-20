/**
 * Compat shim for @/app/api/user/actions (server actions → authClient/fetch)
 */
import { authClient } from 'auth/client'

type ActionState = { success: boolean; message?: string }
type UpdateUserActionState = ActionState & { user?: any; currentUserUpdated?: boolean }
type DeleteUserActionState = ActionState
type UpdateUserPasswordActionState = ActionState

export const updateUserImageAction = async (formData: FormData): Promise<UpdateUserActionState> => {
  const userId = (formData.get('userId') as string) ?? ''
  const image = (formData.get('image') as string) ?? ''
  try {
    const res = await fetch('/api/user/details', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, message: err.error || 'Failed to update image' }
    }
    const { user } = await res.json()
    return { success: true, message: 'Profile photo updated successfully', user, currentUserUpdated: true }
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to update image' }
  }
}

export const updateUserDetailsAction = async (formData: FormData): Promise<UpdateUserActionState> => {
  const name = (formData.get('name') as string) ?? undefined
  const image = (formData.get('image') as string) ?? undefined
  try {
    const res = await fetch('/api/user/details', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, image }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, message: err.error || 'Failed to update user' }
    }
    const { user } = await res.json()
    return { success: true, message: 'Profile updated successfully', user, currentUserUpdated: true }
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to update user' }
  }
}

export const deleteUserAction = async (formData: FormData): Promise<DeleteUserActionState> => {
  try {
    const res = await fetch('/api/user', { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, message: err.error || 'Failed to delete account' }
    }
    return { success: true, message: 'Account deleted' }
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to delete account' }
  }
}

export const updateUserPasswordAction = async (formData: FormData): Promise<UpdateUserPasswordActionState> => {
  const currentPassword = (formData.get('currentPassword') as string) ?? ''
  const newPassword = (formData.get('newPassword') as string) ?? ''
  try {
    const res = await fetch('/api/user/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, message: err.error || 'Failed to update password' }
    }
    return { success: true, message: 'Password updated successfully' }
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to update password' }
  }
}

export async function generateAvatarImageAction(options: {
  prompt?: string
  provider?: 'openai' | 'xai' | 'nanobanana'
}) {
  const res = await fetch('/api/user/generate-avatar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  if (!res.ok) throw new Error('Failed to generate avatar')
  return res.json()
}

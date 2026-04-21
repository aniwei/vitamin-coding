/**
 * Compat shim for @/app/api/admin/actions (server actions → fetch calls)
 */

type ActionState = { success?: boolean; message?: string; errors?: Record<string, string[]> }
type UpdateUserRoleActionState = ActionState & { user?: any }
type UpdateUserBanStatusActionState = ActionState & { user?: any }

export const updateUserRolesAction = async (
  _prevState: UpdateUserRoleActionState,
  formData: FormData,
): Promise<UpdateUserRoleActionState> => {
  const userId = (formData.get('userId') as string) ?? ''
  const role = (formData.get('role') as string) ?? ''
  try {
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, message: err.error || 'Failed to update role' }
    }
    const user = await res.json()
    return { success: true, message: 'Role updated', user }
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to update role' }
  }
}

export const updateUserBanStatusAction = async (
  _prevState: UpdateUserBanStatusActionState,
  formData: FormData,
): Promise<UpdateUserBanStatusActionState> => {
  const userId = (formData.get('userId') as string) ?? ''
  const banned = formData.get('banned') === 'true'
  try {
    const res = await fetch(`/api/admin/users/${userId}/ban`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ banned }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, message: err.error || 'Failed to update ban status' }
    }
    const user = await res.json()
    return { success: true, message: 'Ban status updated', user }
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to update ban status' }
  }
}

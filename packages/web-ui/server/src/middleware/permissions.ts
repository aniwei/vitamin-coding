/**
 * Hono 版权限辅助函数 —— 直接接受 session 对象，不依赖 next/headers。
 * 替代 src/lib/auth/permissions.ts 中所有 getSession() 的调用。
 */
import {
  admin,
  editor,
  user as userRole,
} from '../../../src/lib/auth/roles'
import { parseRoleString, isBetterAuthRole } from '../../../src/lib/auth/types'
import { getIsUserAdmin } from '../../../src/lib/user/utils'
import type { BetterAuthRole } from '../../../src/lib/auth/types'

type SessionLike = { user: { id: string; role?: string | null } }

function getRolePermissions(role: string | undefined | null): BetterAuthRole {
  switch (parseRoleString(role)) {
    case 'admin':
      return admin as BetterAuthRole
    case 'editor':
      return editor as BetterAuthRole
    default:
      return userRole as BetterAuthRole
  }
}

function hasResourcePermission(
  role: string | undefined | null,
  permission: 'use' | 'create' | 'list' | 'delete' | 'update' | 'view' | 'share',
  resource: 'agent' | 'workflow' | 'mcp' | 'chat' | 'temporaryChat',
): boolean {
  const roleObj = getRolePermissions(role)
  if (!isBetterAuthRole(roleObj)) return false
  const perms = roleObj.statements[resource] as string[] | undefined
  return Array.isArray(perms) && perms.includes(permission)
}

export function isAdmin(session: SessionLike): boolean {
  return getIsUserAdmin(session.user as any)
}

export function hasEditorPermission(session: SessionLike): boolean {
  const r = session.user.role
  return r === 'admin' || r === 'editor'
}

export function canManageUser(targetUserId: string, session: SessionLike): boolean {
  if (session.user.id === targetUserId) return true
  return isAdmin(session)
}

export function canListUsers(session: SessionLike): boolean {
  return isAdmin(session)
}

export function canManageUsers(session: SessionLike): boolean {
  return isAdmin(session)
}

export function canCreateAgent(session: SessionLike): boolean {
  return hasResourcePermission(session.user.role, 'create', 'agent')
}
export function canEditAgent(session: SessionLike): boolean {
  return hasResourcePermission(session.user.role, 'update', 'agent')
}
export function canDeleteAgent(session: SessionLike): boolean {
  return hasResourcePermission(session.user.role, 'delete', 'agent')
}

export function canCreateWorkflow(session: SessionLike): boolean {
  return hasResourcePermission(session.user.role, 'create', 'workflow')
}
export function canEditWorkflow(session: SessionLike): boolean {
  return hasResourcePermission(session.user.role, 'update', 'workflow')
}
export function canDeleteWorkflow(session: SessionLike): boolean {
  return hasResourcePermission(session.user.role, 'delete', 'workflow')
}

export function canCreateMCP(session: SessionLike): boolean {
  return hasResourcePermission(session.user.role, 'create', 'mcp')
}
export function canManageMCPServer(
  mcpOwnerUserId: string,
  visibility: string | null | undefined,
  session: SessionLike,
): boolean {
  if (session.user.id === mcpOwnerUserId) return true
  if (visibility === 'public' && isAdmin(session)) return true
  return isAdmin(session)
}

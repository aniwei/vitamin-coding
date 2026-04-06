// @vitamin/hooks permission 模块桶导出
export { PermissionPolicyRegistry, compilePolicyFromSetting } from './policy-registry'
export { PermissionAuditLog } from './audit-log'
export { PermissionGuardHook, createPermissionGuardHook } from './permission-guard'
export {
  FILE_GUARD_POLICY,
  DESTRUCTIVE_COMMAND_POLICY,
  createDirectoryFreezePolicy,
  createDisabledToolsPolicy,
  createAgentBoundaryPolicy,
  createPermissionModePolicy,
} from './builtin-policies'

export type {
  RuleEffect,
  PermissionMode,
  PolicyScope,
  PermissionContext,
  RuleMatch,
  PermissionRule,
  PermissionPolicy,
  PermissionDecision,
  PermissionAuditEntry,
  PermissionRuleConfig,
  PermissionPolicySetting,
} from './types'

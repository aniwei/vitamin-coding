// @x-mars/hooks permission 模块桶导出
export {
  PermissionPolicyRegistry,
  compilePolicyFromSetting,
  createPermissionRegistry,
} from './policy-registry'
export { PermissionAuditLog } from './audit-log'
export { PermissionGuardHook, createPermissionGuardHook } from './permission-guard'
export {
  FILE_GUARD_POLICY,
  DESTRUCTIVE_COMMAND_POLICY,
  createNonBypassableSafetyPolicy,
  createNetworkSafetyPolicy,
  createFileGuardPolicy,
  createPermissionToolSetsFromRegistry,
  createDirectoryFreezePolicy,
  createDisabledToolsPolicy,
  createAgentBoundaryPolicy,
  createSidechainBoundaryPolicy,
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

export type {
  PermissionToolDescriptor,
  PermissionToolSets,
  PermissionToolSetsInput,
} from './builtin-policies'

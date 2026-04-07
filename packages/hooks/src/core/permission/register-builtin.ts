import {
  createFileGuardPolicy,
  createPermissionModePolicy,
  DESTRUCTIVE_COMMAND_POLICY,
} from './builtin-policies'
import type { PermissionPolicyRegistry } from './policy-registry'
import type { PermissionToolSetsInput } from './builtin-policies'

export interface RegisterBuiltinPoliciesOptions {
  toolSets?: PermissionToolSetsInput
}

export function registerBuiltinPolicies(
  registry: PermissionPolicyRegistry,
  options: RegisterBuiltinPoliciesOptions = {},
): void {
  registry.register(createPermissionModePolicy('auto', options.toolSets))
  registry.register(createFileGuardPolicy(options.toolSets))
  registry.register(DESTRUCTIVE_COMMAND_POLICY)
}
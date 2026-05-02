import {
  createNonBypassableSafetyPolicy,
  createNetworkSafetyPolicy,
  createFileGuardPolicy,
  createPermissionModePolicy,
  createSidechainBoundaryPolicy,
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
  registry.register(createNonBypassableSafetyPolicy(options.toolSets))
  registry.register(createNetworkSafetyPolicy(options.toolSets))
  registry.register(createPermissionModePolicy('auto', options.toolSets))
  registry.register(createFileGuardPolicy(options.toolSets))
  registry.register(createSidechainBoundaryPolicy())
  registry.register(DESTRUCTIVE_COMMAND_POLICY)
}

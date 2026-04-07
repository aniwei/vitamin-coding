import { createPermissionModePolicy, DESTRUCTIVE_COMMAND_POLICY, FILE_GUARD_POLICY } from './builtin-policies'
import type { PermissionPolicyRegistry } from './policy-registry'

export function registerBuiltinPolicies(registry: PermissionPolicyRegistry): void {
  registry.register(createPermissionModePolicy('auto'))
  registry.register(FILE_GUARD_POLICY)
  registry.register(DESTRUCTIVE_COMMAND_POLICY)
}
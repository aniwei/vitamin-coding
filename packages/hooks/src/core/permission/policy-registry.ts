import { createLogger } from '@vitamin/shared'
import { registerBuiltinPolicies } from './register-builtin'
import type { RegisterBuiltinPoliciesOptions } from './register-builtin'
import type { PermissionPolicySetting } from './types'
import type {
  PermissionPolicy,
  PermissionContext,
  PermissionDecision,
  PolicyScope,
  RuleMatch,
  PermissionRule,
} from './types'

const logger = createLogger('@vitamin/hooks:permission')

function matchesScopeAgent(scope: PolicyScope, agentName: string): boolean {
  if (!scope.agents || scope.agents.length === 0) {
    return true
  }
  return scope.agents.includes('*') || scope.agents.includes(agentName)
}

function matchesScopeSession(scope: PolicyScope, sessionId: string): boolean {
  if (!scope.sessions || scope.sessions.length === 0) {
    return true
  }
  return scope.sessions.includes('*') || scope.sessions.includes(sessionId)
}

function matchesScope(scope: PolicyScope, ctx: PermissionContext): boolean {
  return matchesScopeAgent(scope, ctx.agentName) && matchesScopeSession(scope, ctx.sessionId)
}

function matchesRule(match: RuleMatch, ctx: PermissionContext): boolean {
  // tools 匹配
  if (match.tools && match.tools.length > 0) {
    if (!match.tools.includes(ctx.toolName)) {
      return false
    }
  }
  // paths 匹配
  if (match.paths && match.paths.length > 0) {
    if (!ctx.filePath) {
      return false
    }
    const pathMatched = match.paths.some((pattern) => pattern.test(ctx.filePath!))
    if (!pathMatched) {
      return false
    }
  }
  // 自定义条件
  if (match.condition) {
    if (!match.condition(ctx)) {
      return false
    }
  }
  return true
}

const DEFAULT_ALLOW: PermissionDecision = {
  effect: 'allow',
  policyName: '__default__',
  ruleName: '__fallthrough__',
  timestamp: 0,
  evaluatedPolicies: 0,
}

export class PermissionPolicyRegistry {
  private policies: PermissionPolicy[] = []

  register(policy: PermissionPolicy): void {
    this.unregister(policy.name)
    this.policies.push(policy)
    this.policies.sort((a, b) => a.priority - b.priority)
    logger.debug(
      `Permission policy registered: ${policy.name} (priority=${policy.priority}, rules=${policy.rules.length})`,
    )
  }

  registerAll(policies: PermissionPolicy[]): void {
    for (const p of policies) {
      this.register(p)
    }
  }

  unregister(name: string): boolean {
    const idx = this.policies.findIndex((p) => p.name === name)
    if (idx >= 0) {
      this.policies.splice(idx, 1)
      logger.debug(`Permission policy unregistered: ${name}`)
      return true
    }
    return false
  }

  has(name: string): boolean {
    return this.policies.some((p) => p.name === name)
  }

  evaluate(context: PermissionContext): PermissionDecision {
    let evaluated = 0

    for (const policy of this.policies) {
      if (!policy.enabled) {
        continue
      }
      if (!matchesScope(policy.scope, context)) {
        continue
      }
      evaluated++

      for (const rule of policy.rules) {
        if (matchesRule(rule.match, context)) {
          return {
            effect: rule.effect,
            policyName: policy.name,
            ruleName: rule.name,
            reason: rule.effect === 'deny' ? rule.denyReason : rule.askPrompt,
            timestamp: Date.now(),
            evaluatedPolicies: evaluated,
          }
        }
      }
    }

    return {
      ...DEFAULT_ALLOW,
      timestamp: Date.now(),
      evaluatedPolicies: evaluated,
    }
  }

  getEffective(agentName: string): PermissionPolicy[] {
    return this.policies.filter((p) => p.enabled && matchesScopeAgent(p.scope, agentName))
  }

  getAll(): PermissionPolicy[] {
    return [...this.policies]
  }

  clear(): void {
    this.policies = []
    logger.debug('All permission policies cleared')
  }
}

export function createPermissionRegistry(
  options: RegisterBuiltinPoliciesOptions = {},
): PermissionPolicyRegistry {
  const registry = new PermissionPolicyRegistry()
  registerBuiltinPolicies(registry, options)
  return registry
}

export function compilePolicyFromSetting(setting: PermissionPolicySetting): PermissionPolicy {
  const rules: PermissionRule[] = setting.rules.map((rc) => ({
    name: rc.name,
    effect: rc.effect,
    match: {
      tools: rc.tools,
      paths: rc.paths?.map((p) => new RegExp(p)),
    },
    denyReason: rc.deny_reason,
    askPrompt: rc.ask_prompt,
  }))

  return {
    name: setting.name,
    priority: setting.priority ?? 50,
    enabled: setting.enabled ?? true,
    scope: {
      agents: setting.scope?.agents,
      sessions: setting.scope?.sessions,
    },
    rules,
  }
}

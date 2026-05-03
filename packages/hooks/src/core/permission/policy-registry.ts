import { createLogger } from '@x-mars/shared'
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

const logger = createLogger('@x-mars/hooks:permission')

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
    const filePaths = ctx.filePaths ?? (ctx.filePath ? [ctx.filePath] : [])
    if (filePaths.length === 0) {
      return false
    }
    const paths = match.paths
    const pathMatched = filePaths.some((filePath) =>
      paths.some((pattern) => pattern.test(filePath)),
    )
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

const MIN_SETTING_POLICY_PRIORITY = 25
const READ_TOOL_NAMES = [
  'read',
  'grep',
  'glob',
  'ls',
  'web_fetch',
  'web_search',
  'skill_search',
  'skill_view',
  'tool_output_read',
]
const WRITE_TOOL_NAMES = ['write', 'edit', 'multi_edit', 'apply_patch']

export class PermissionPolicyRegistry {
  private policies: PermissionPolicy[] = []

  register(policy: PermissionPolicy): void {
    this.unregister(policy.name)
    this.policies.push(policy)
    this.policies.sort((a, b) => a.priority - b.priority)
    logger.debug(
      { name: policy.name, priority: policy.priority, rules: policy.rules.length },
      'Permission policy registered',
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
      logger.debug({ name }, 'Permission policy unregistered')
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
    match: compileRuleMatch(rc.match, rc.tools, rc.paths),
    denyReason: rc.deny_reason,
    askPrompt: rc.ask_prompt,
  }))

  return {
    name: setting.name,
    priority: Math.max(setting.priority ?? 50, MIN_SETTING_POLICY_PRIORITY),
    enabled: setting.enabled ?? true,
    scope: {
      agents: setting.scope?.agents,
      sessions: setting.scope?.sessions,
    },
    rules,
  }
}

function compileRuleMatch(
  dsl: string | undefined,
  tools: string[] | undefined,
  paths: string[] | undefined,
): PermissionRule['match'] {
  const base = dsl ? compilePermissionDsl(dsl) : {}
  return {
    ...base,
    tools: tools ?? base.tools,
    paths: paths ? paths.map((p) => new RegExp(p)) : base.paths,
  }
}

function compilePermissionDsl(dsl: string): PermissionRule['match'] {
  const match = /^(Read|Write|Bash)\((.*)\)$/.exec(dsl.trim())
  if (!match) {
    throw new Error(`Invalid permission DSL: ${dsl}`)
  }

  const kind = match[1]
  const pattern = match[2]?.trim() ?? '*'

  if (kind === 'Read') {
    return {
      tools: READ_TOOL_NAMES,
      paths: compilePathPattern(pattern),
    }
  }

  if (kind === 'Write') {
    return {
      tools: WRITE_TOOL_NAMES,
      paths: compilePathPattern(pattern),
    }
  }

  return {
    tools: ['bash'],
    condition: (context) => matchesShellCommand(pattern, context.args),
  }
}

function compilePathPattern(pattern: string): RegExp[] | undefined {
  if (!pattern || pattern === '*') {
    return undefined
  }
  return [globToRegExp(pattern)]
}

function matchesShellCommand(pattern: string, args: Record<string, unknown>): boolean {
  const command = args.command ?? args.cmd
  if (typeof command !== 'string') {
    return false
  }
  if (!pattern || pattern === '*') {
    return true
  }
  return globToRegExp(pattern).test(command.trim())
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const regex = escaped
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/\u0000/g, '.*')
  return new RegExp(`^${regex}$`)
}

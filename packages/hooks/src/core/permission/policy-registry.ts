// 权限策略注册表 — 管理策略集合并执行 first-match 评估
import { createLogger } from '@vitamin/shared'

import type {
  PermissionPolicy,
  PermissionContext,
  PermissionDecision,
  PolicyScope,
  RuleMatch,
  PermissionRule,
} from './types'

const logger = createLogger('@vitamin/hooks:permission')

// ═══ scope / rule 匹配 ═══

function matchesScopeAgent(scope: PolicyScope, agentName: string): boolean {
  if (!scope.agents || scope.agents.length === 0) return true
  return scope.agents.includes('*') || scope.agents.includes(agentName)
}

function matchesScopeSession(scope: PolicyScope, sessionId: string): boolean {
  if (!scope.sessions || scope.sessions.length === 0) return true
  return scope.sessions.includes('*') || scope.sessions.includes(sessionId)
}

function matchesScope(scope: PolicyScope, ctx: PermissionContext): boolean {
  return matchesScopeAgent(scope, ctx.agentName) && matchesScopeSession(scope, ctx.sessionId)
}

function matchesRule(match: RuleMatch, ctx: PermissionContext): boolean {
  // tools 匹配
  if (match.tools && match.tools.length > 0) {
    if (!match.tools.includes(ctx.toolName)) return false
  }
  // paths 匹配
  if (match.paths && match.paths.length > 0) {
    if (!ctx.filePath) return false
    const pathMatched = match.paths.some(pattern => pattern.test(ctx.filePath!))
    if (!pathMatched) return false
  }
  // 自定义条件
  if (match.condition) {
    if (!match.condition(ctx)) return false
  }
  return true
}

// ═══ Default fallthrough decision ═══

const DEFAULT_ALLOW: PermissionDecision = {
  effect: 'allow',
  policyName: '__default__',
  ruleName: '__fallthrough__',
  timestamp: 0,
  evaluatedPolicies: 0,
}

// ═══ PermissionPolicyRegistry ═══

export class PermissionPolicyRegistry {
  private policies: PermissionPolicy[] = []

  /** 注册策略 (同名替换) */
  register(policy: PermissionPolicy): void {
    this.unregister(policy.name)
    this.policies.push(policy)
    this.policies.sort((a, b) => a.priority - b.priority)
    logger.debug(`Permission policy registered: ${policy.name} (priority=${policy.priority}, rules=${policy.rules.length})`)
  }

  /** 批量注册 */
  registerAll(policies: PermissionPolicy[]): void {
    for (const p of policies) this.register(p)
  }

  /** 注销策略 */
  unregister(name: string): boolean {
    const idx = this.policies.findIndex(p => p.name === name)
    if (idx >= 0) {
      this.policies.splice(idx, 1)
      logger.debug(`Permission policy unregistered: ${name}`)
      return true
    }
    return false
  }

  /** 查询策略是否存在 */
  has(name: string): boolean {
    return this.policies.some(p => p.name === name)
  }

  /** first-match 评估 */
  evaluate(context: PermissionContext): PermissionDecision {
    let evaluated = 0

    for (const policy of this.policies) {
      if (!policy.enabled) continue
      if (!matchesScope(policy.scope, context)) continue
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

    // 无命中 → 默认放行
    return {
      ...DEFAULT_ALLOW,
      timestamp: Date.now(),
      evaluatedPolicies: evaluated,
    }
  }

  /** 获取对指定 agent 生效的策略列表 */
  getEffective(agentName: string): PermissionPolicy[] {
    return this.policies.filter(p =>
      p.enabled && matchesScopeAgent(p.scope, agentName),
    )
  }

  /** 获取所有已注册策略 */
  getAll(): PermissionPolicy[] {
    return [...this.policies]
  }

  /** 清空所有策略 */
  clear(): void {
    this.policies = []
    logger.debug('All permission policies cleared')
  }
}

// ═══ 配置编译: PermissionPolicyConfig → PermissionPolicy ═══

import type { PermissionPolicyConfig } from './types'

export function compilePolicyFromConfig(config: PermissionPolicyConfig): PermissionPolicy {
  const rules: PermissionRule[] = config.rules.map(rc => ({
    name: rc.name,
    effect: rc.effect,
    match: {
      tools: rc.tools,
      paths: rc.paths?.map(p => new RegExp(p)),
    },
    denyReason: rc.deny_reason,
    askPrompt: rc.ask_prompt,
  }))

  return {
    name: config.name,
    priority: config.priority ?? 50,
    enabled: config.enabled ?? true,
    scope: {
      agents: config.scope?.agents,
      sessions: config.scope?.sessions,
    },
    rules,
  }
}

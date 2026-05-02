// @x-mars/hooks 权限体系核心类型
import type { HookTiming } from '../../types'

// ═══ Permission Policy ═══

export type RuleEffect = 'allow' | 'deny' | 'ask'

export type PermissionMode =
  | 'bypass' // 跳过所有权限检查 (开发模式)
  | 'auto' // 读操作放行, 写操作按策略
  | 'confirm' // 所有写操作需人工确认
  | 'strict' // 无匹配则 deny
  | 'readonly' // 仅允许读取类工具

export interface PolicyScope {
  /** 适用的 agent 名称, '*' 或缺省表示所有 */
  agents?: string[]
  /** 适用的 session ID 模式 */
  sessions?: string[]
}

/** 权限判定上下文 */
export interface PermissionContext {
  timing: HookTiming
  toolName: string
  args: Record<string, unknown>
  agentName: string
  sessionId: string
  /** Primary file path for backward compatibility and audit display. */
  filePath?: string
  /** All file paths discovered from tool args. Path rules match any entry. */
  filePaths?: string[]
  /** URL-like targets discovered from tool args for network permission policies. */
  urls?: string[]
  metadata: Record<string, unknown>
}

/** 规则匹配条件 */
export interface RuleMatch {
  /** 工具名称列表 (精确匹配) */
  tools?: string[]
  /** 文件路径正则 */
  paths?: RegExp[]
  /** 自定义断言 (必须同步) */
  condition?: (context: PermissionContext) => boolean
}

/** 单条权限规则 */
export interface PermissionRule {
  name: string
  effect: RuleEffect
  match: RuleMatch
  denyReason?: string
  askPrompt?: string
}

/** 权限策略 */
export interface PermissionPolicy {
  name: string
  priority: number
  enabled: boolean
  scope: PolicyScope
  rules: PermissionRule[]
}

/** 权限判定结果 */
export interface PermissionDecision {
  effect: RuleEffect
  policyName: string
  ruleName: string
  reason?: string
  timestamp: number
  evaluatedPolicies: number
}

/** 审计日志条目 */
export interface PermissionAuditEntry {
  timestamp: number
  sessionId: string
  agentName: string
  toolName: string
  filePath?: string
  metadata?: Record<string, unknown>
  decision: PermissionDecision
}

// ═══ 配置 Schema 类型 (YAML → Policy 编译用) ═══

export interface PermissionRuleConfig {
  name: string
  effect: RuleEffect
  tools?: string[]
  paths?: string[]
  deny_reason?: string
  ask_prompt?: string
}

export interface PermissionPolicySetting {
  name: string
  priority?: number
  enabled?: boolean
  scope?: {
    agents?: string[]
    sessions?: string[]
  }
  rules: PermissionRuleConfig[]
}

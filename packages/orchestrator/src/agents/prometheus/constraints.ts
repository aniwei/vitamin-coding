// Prometheus 约束系统 — 计划验证和约束检查
import type { Plan } from './plan-format'

// 约束检查结果
export interface ConstraintViolation {
  stepId: string
  rule: string
  message: string
  severity: 'error' | 'warning'
}

export interface ConstraintCheckResult {
  valid: boolean
  violations: ConstraintViolation[]
}

// 计划约束规则
export interface PlanConstraint {
  name: string
  description: string
  check: (plan: Plan) => ConstraintViolation[]
}

// 内置约束规则集
const BUILTIN_CONSTRAINTS: PlanConstraint[] = [
  {
    name: 'unique-ids',
    description: '所有步骤 ID 必须唯一',
    check(plan) {
      const violations: ConstraintViolation[] = []
      const seen = new Set<string>()
      for (const step of plan.steps) {
        if (seen.has(step.id)) {
          violations.push({
            stepId: step.id,
            rule: 'unique-ids',
            message: `重复的步骤 ID：${step.id}`,
            severity: 'error',
          })
        }
        seen.add(step.id)
      }
      return violations
    },
  },
  {
    name: 'valid-dependencies',
    description: '所有依赖必须引用已存在的步骤 ID',
    check(plan) {
      const violations: ConstraintViolation[] = []
      const stepIds = new Set(plan.steps.map(s => s.id))
      for (const step of plan.steps) {
        for (const dep of step.dependencies) {
          if (!stepIds.has(dep)) {
            violations.push({
              stepId: step.id,
              rule: 'valid-dependencies',
              message: `依赖项 "${dep}" 未引用有效步骤`,
              severity: 'error',
            })
          }
        }
      }
      return violations
    },
  },
  {
    name: 'no-circular-dependencies',
    description: '依赖图必须是无环的',
    check(plan) {
      const violations: ConstraintViolation[] = []
      const adjList = new Map<string, string[]>()
      for (const step of plan.steps) {
        adjList.set(step.id, step.dependencies)
      }

      // Kahn 算法 / DFS 环检测
      const visited = new Set<string>()
      const inStack = new Set<string>()

      function hasCycle(nodeId: string): boolean {
        if (inStack.has(nodeId)) return true
        if (visited.has(nodeId)) return false

        visited.add(nodeId)
        inStack.add(nodeId)

        const deps = adjList.get(nodeId) ?? []
        for (const dep of deps) {
          if (hasCycle(dep)) return true
        }

        inStack.delete(nodeId)
        return false
      }

      for (const step of plan.steps) {
        visited.clear()
        inStack.clear()
        if (hasCycle(step.id)) {
          violations.push({
            stepId: step.id,
            rule: 'no-circular-dependencies',
            message: `检测到涉及步骤 "${step.id}" 的循环依赖`,
            severity: 'error',
          })
          break
        }
      }
      return violations
    },
  },
  {
    name: 'reasonable-estimates',
    description: '时间估算应在 1 到 480 分钟之间',
    check(plan) {
      const violations: ConstraintViolation[] = []
      for (const step of plan.steps) {
        if (step.estimatedMinutes <= 0) {
          violations.push({
            stepId: step.id,
            rule: 'reasonable-estimates',
            message: `步骤缺少时间估算`,
            severity: 'warning',
          })
        } else if (step.estimatedMinutes > 480) {
          violations.push({
            stepId: step.id,
            rule: 'reasonable-estimates',
            message: `估算 ${step.estimatedMinutes} 分钟超过 8 小时限制 — 建议拆分`,
            severity: 'warning',
          })
        }
      }
      return violations
    },
  },
  {
    name: 'non-empty-descriptions',
    description: '所有步骤必须有描述',
    check(plan) {
      const violations: ConstraintViolation[] = []
      for (const step of plan.steps) {
        if (!step.description || step.description.trim().length === 0) {
          violations.push({
            stepId: step.id,
            rule: 'non-empty-descriptions',
            message: `步骤 "${step.id}" 缺少描述`,
            severity: 'warning',
          })
        }
      }
      return violations
    },
  },
]

// 验证计划是否满足所有约束
export function validatePlanConstraints(
  plan: Plan,
  additionalConstraints?: PlanConstraint[],
): ConstraintCheckResult {
  const allConstraints = [...BUILTIN_CONSTRAINTS, ...(additionalConstraints ?? [])]
  const violations: ConstraintViolation[] = []

  for (const constraint of allConstraints) {
    violations.push(...constraint.check(plan))
  }

  return {
    valid: violations.filter(v => v.severity === 'error').length === 0,
    violations,
  }
}

// 导出内置约束列表（供测试使用）
export const PLAN_CONSTRAINTS = BUILTIN_CONSTRAINTS

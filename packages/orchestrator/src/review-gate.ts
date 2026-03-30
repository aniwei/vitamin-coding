// ═══════════════════════════════════════════════════════════
// @vitamin/orchestrator — Review Gate
// ═══════════════════════════════════════════════════════════
// 可插拔检查器链：spec compliance → code quality → test → custom
// 参照 superpowers 的 two-stage review 模式

import type { OrchestratorEventBus } from './events'

// ═══ 数据模型 ═══

export type ReviewType = 'spec' | 'quality' | 'test' | 'custom'
export type ReviewVerdict = 'pass' | 'fail' | 'skip'

export interface ReviewIssue {
  severity: 'critical' | 'important' | 'minor'
  message: string
  file?: string
  line?: number
}

export interface ReviewResult {
  type: ReviewType
  verdict: ReviewVerdict
  issues: ReviewIssue[]
  summary: string
}

export interface ReviewChecker {
  type: ReviewType
  name: string
  check(context: ReviewContext): Promise<ReviewResult>
}

export interface ReviewContext {
  taskId: string
  planId?: string
  stepId?: string
  output: string
  prompt: string
  artifacts?: Record<string, unknown>
}

// ═══ Review Gate ═══

export interface ReviewGate {
  addChecker(checker: ReviewChecker): void
  removeChecker(type: ReviewType): void
  listCheckers(): ReviewChecker[]

  /**
   * 执行所有检查器。遵循 superpowers 的两阶段顺序：
   * spec → quality → test → custom
   * 如果 spec 不通过，不会继续后续检查。
   */
  run(context: ReviewContext): Promise<{
    passed: boolean
    results: ReviewResult[]
    blockers: ReviewIssue[]
  }>
}

export type Approver = ReviewGate

const REVIEW_ORDER: ReviewType[] = ['spec', 'quality', 'test', 'custom']

export function createReviewGate(eventBus?: OrchestratorEventBus): ReviewGate {
  const checkers = new Map<ReviewType, ReviewChecker>()

  return {
    addChecker(checker: ReviewChecker) {
      checkers.set(checker.type, checker)
    },

    removeChecker(type: ReviewType) {
      checkers.delete(type)
    },

    listCheckers() {
      return Array.from(checkers.values())
    },

    async run(context: ReviewContext) {
      const results: ReviewResult[] = []
      const blockers: ReviewIssue[] = []
      let passed = true

      for (const type of REVIEW_ORDER) {
        const checker = checkers.get(type)
        if (!checker) continue

        await eventBus?.emit('review.requested', {
          taskId: context.taskId,
          reviewType: type,
        })

        const result = await checker.check(context)
        results.push(result)

        if (result.verdict === 'fail') {
          passed = false
          const critical = result.issues.filter(i => i.severity === 'critical' || i.severity === 'important')
          blockers.push(...critical)

          await eventBus?.emit('review.failed', {
            taskId: context.taskId,
            reviewType: type,
            issues: critical.map(i => i.message),
          })

          // Spec failure blocks further review (superpowers pattern)
          if (type === 'spec') break
        } else {
          await eventBus?.emit('review.passed', {
            taskId: context.taskId,
            reviewType: type,
          })
        }
      }

      return { passed, results, blockers }
    },
  }
}

export const createApprover = createReviewGate

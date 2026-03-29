import { describe, it, expect } from 'vitest'
import { createReviewGate, createEventBus } from '../src'
import type { ReviewChecker, ReviewContext, ReviewResult } from '../src/review-gate'
import type { OrchestratorEventBus, OrchestratorEventType } from '../src/events'

function makeContext(overrides: Partial<ReviewContext> = {}): ReviewContext {
  return {
    taskId: 'task-1',
    output: 'function hello() { return "world" }',
    prompt: 'Implement hello function',
    ...overrides,
  }
}

function passChecker(type: ReviewChecker['type']): ReviewChecker {
  return {
    type,
    name: `${type}-checker`,
    async check(): Promise<ReviewResult> {
      return { type, verdict: 'pass', issues: [], summary: `${type} passed` }
    },
  }
}

function failChecker(
  type: ReviewChecker['type'],
  severity: 'critical' | 'important' | 'minor' = 'critical',
): ReviewChecker {
  return {
    type,
    name: `${type}-checker`,
    async check(): Promise<ReviewResult> {
      return {
        type,
        verdict: 'fail',
        issues: [{ severity, message: `${type} check failed` }],
        summary: `${type} failed`,
      }
    },
  }
}

describe('createReviewGate', () => {
  it('passes with no checkers', async () => {
    const gate = createReviewGate()
    const result = await gate.run(makeContext())

    expect(result.passed).toBe(true)
    expect(result.results).toHaveLength(0)
    expect(result.blockers).toHaveLength(0)
  })

  it('passes when all checkers pass', async () => {
    const gate = createReviewGate()
    gate.addChecker(passChecker('spec'))
    gate.addChecker(passChecker('quality'))
    gate.addChecker(passChecker('test'))

    const result = await gate.run(makeContext())

    expect(result.passed).toBe(true)
    expect(result.results).toHaveLength(3)
  })

  it('fails when any checker fails', async () => {
    const gate = createReviewGate()
    gate.addChecker(passChecker('spec'))
    gate.addChecker(failChecker('quality'))

    const result = await gate.run(makeContext())

    expect(result.passed).toBe(false)
    expect(result.blockers).toHaveLength(1)
    expect(result.blockers[0].message).toContain('quality check failed')
  })

  it('spec failure blocks further review', async () => {
    const gate = createReviewGate()
    const executionOrder: string[] = []

    gate.addChecker({
      type: 'spec',
      name: 'spec-checker',
      async check() {
        executionOrder.push('spec')
        return {
          type: 'spec',
          verdict: 'fail',
          issues: [{ severity: 'critical', message: 'spec mismatch' }],
          summary: 'spec failed',
        }
      },
    })
    gate.addChecker({
      type: 'quality',
      name: 'quality-checker',
      async check() {
        executionOrder.push('quality')
        return { type: 'quality', verdict: 'pass', issues: [], summary: 'ok' }
      },
    })

    await gate.run(makeContext())

    // Quality checker should NOT have been called because spec failed
    expect(executionOrder).toEqual(['spec'])
  })

  it('non-spec failure does NOT block subsequent checkers', async () => {
    const gate = createReviewGate()
    const executionOrder: string[] = []

    gate.addChecker({
      type: 'quality',
      name: 'quality-checker',
      async check() {
        executionOrder.push('quality')
        return {
          type: 'quality',
          verdict: 'fail',
          issues: [{ severity: 'important', message: 'poor quality' }],
          summary: 'failed',
        }
      },
    })
    gate.addChecker({
      type: 'test',
      name: 'test-checker',
      async check() {
        executionOrder.push('test')
        return { type: 'test', verdict: 'pass', issues: [], summary: 'ok' }
      },
    })

    const result = await gate.run(makeContext())

    // test checker should still run
    expect(executionOrder).toEqual(['quality', 'test'])
    expect(result.passed).toBe(false)
  })

  it('runs checkers in order: spec → quality → test → custom', async () => {
    const gate = createReviewGate()
    const order: string[] = []

    for (const type of ['custom', 'test', 'quality', 'spec'] as const) {
      gate.addChecker({
        type,
        name: `${type}-checker`,
        async check() {
          order.push(type)
          return { type, verdict: 'pass', issues: [], summary: 'ok' }
        },
      })
    }

    await gate.run(makeContext())
    expect(order).toEqual(['spec', 'quality', 'test', 'custom'])
  })

  it('only collects critical/important issues as blockers', async () => {
    const gate = createReviewGate()
    gate.addChecker({
      type: 'quality',
      name: 'quality-checker',
      async check() {
        return {
          type: 'quality',
          verdict: 'fail',
          issues: [
            { severity: 'critical', message: 'security issue' },
            { severity: 'minor', message: 'style nit' },
            { severity: 'important', message: 'missing error handling' },
          ],
          summary: 'issues found',
        }
      },
    })

    const result = await gate.run(makeContext())
    expect(result.blockers).toHaveLength(2)
    expect(result.blockers.map(b => b.message)).toEqual([
      'security issue',
      'missing error handling',
    ])
  })

  it('addChecker replaces existing checker of same type', () => {
    const gate = createReviewGate()
    gate.addChecker({ type: 'spec', name: 'v1', async check() { return { type: 'spec', verdict: 'pass', issues: [], summary: '' } } })
    gate.addChecker({ type: 'spec', name: 'v2', async check() { return { type: 'spec', verdict: 'pass', issues: [], summary: '' } } })

    expect(gate.listCheckers()).toHaveLength(1)
    expect(gate.listCheckers()[0].name).toBe('v2')
  })

  it('removeChecker removes by type', () => {
    const gate = createReviewGate()
    gate.addChecker(passChecker('spec'))
    gate.addChecker(passChecker('quality'))

    gate.removeChecker('spec')

    expect(gate.listCheckers()).toHaveLength(1)
    expect(gate.listCheckers()[0].type).toBe('quality')
  })

  it('skip verdict is treated as passing', async () => {
    const gate = createReviewGate()
    gate.addChecker({
      type: 'test',
      name: 'test-skip',
      async check() {
        return { type: 'test', verdict: 'skip', issues: [], summary: 'skipped' }
      },
    })

    const result = await gate.run(makeContext())
    expect(result.passed).toBe(true)
  })

  // ═══ Event emission ═══

  it('emits review.requested/passed events', async () => {
    const eventBus = createEventBus()
    const gate = createReviewGate(eventBus)
    gate.addChecker(passChecker('spec'))

    const events: Array<{ type: OrchestratorEventType; payload: unknown }> = []
    eventBus.on('review.requested', (p) => events.push({ type: 'review.requested', payload: p }))
    eventBus.on('review.passed', (p) => events.push({ type: 'review.passed', payload: p }))

    await gate.run(makeContext())

    expect(events).toHaveLength(2)
    expect(events[0].type).toBe('review.requested')
    expect(events[1].type).toBe('review.passed')
  })

  it('emits review.failed on failure', async () => {
    const eventBus = createEventBus()
    const gate = createReviewGate(eventBus)
    gate.addChecker(failChecker('quality'))

    const failEvents: unknown[] = []
    eventBus.on('review.failed', (p) => failEvents.push(p))

    await gate.run(makeContext())

    expect(failEvents).toHaveLength(1)
    expect((failEvents[0] as { reviewType: string }).reviewType).toBe('quality')
  })
})

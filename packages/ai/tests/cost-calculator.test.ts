// @vitamin/ai cost-calculator 测试
import { describe, expect, it } from 'vitest'
import { calculate, createCostTracker } from '../src/cost'

import type { Model, Usage } from '../src/types'

// 测试用模型
function makeModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 'test/model',
    name: 'Test Model',
    api: 'openai-completions',
    provider: 'openai',
    baseUrl: 'https://example.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 10, output: 30, cacheRead: 1, cacheWrite: 5 },
    contextWindow: 128000,
    maxOutputTokens: 4096,
    ...overrides,
  }
}

function makeUsage(overrides: Partial<Usage> = {}): Usage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    ...overrides,
  }
}

describe('calculate', () => {
  describe('#given 1M input tokens at $10/M', () => {
    it('#then returns $10 input cost', () => {
      const model = makeModel()
      const usage = makeUsage({ inputTokens: 1_000_000 })
      const cost = calculate(model, usage)
      expect(cost.input).toBe(10)
      expect(cost.output).toBe(0)
      expect(cost.total).toBe(10)
    })
  })

  describe('#given mixed token types', () => {
    it('#then sums all four categories', () => {
      const model = makeModel()
      const usage = makeUsage({
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheWriteTokens: 1_000_000,
      })
      const cost = calculate(model, usage)
      // 10 + 30 + 1 + 5 = 46
      expect(cost.total).toBe(46)
    })
  })

  describe('#given zero usage', () => {
    it('#then returns zero cost', () => {
      const cost = calculate(makeModel(), makeUsage())
      expect(cost.total).toBe(0)
    })
  })
})

describe('CostTracker', () => {
  describe('#given fresh tracker', () => {
    it('#then total is 0 and count is 0', () => {
      const tracker = createCostTracker()
      expect(tracker.total).toBe(0)
      expect(tracker.count).toBe(0)
    })
  })

  describe('#when record() is called twice', () => {
    it('#then total and count accumulate', () => {
      const tracker = createCostTracker()
      const model = makeModel()
      const usage = makeUsage({ inputTokens: 1_000_000, outputTokens: 500_000 })

      tracker.record(model, usage)
      tracker.record(model, usage)

      expect(tracker.count).toBe(2)
      // 每次: (1M/1M)*10 + (0.5M/1M)*30 = 10 + 15 = 25, 两次 = 50
      expect(tracker.total).toBe(50)
    })
  })

  describe('#when totalTokens is accessed', () => {
    it('#then returns aggregate input/output', () => {
      const tracker = createCostTracker()
      const model = makeModel()
      tracker.record(model, makeUsage({ inputTokens: 100, outputTokens: 50 }))
      tracker.record(model, makeUsage({ inputTokens: 200, outputTokens: 150 }))

      const totals = tracker.totalTokens
      expect(totals.input).toBe(300)
      expect(totals.output).toBe(200)
    })
  })

  describe('#when byModel() is called', () => {
    it('#then groups by model id', () => {
      const tracker = createCostTracker()
      const modelA = makeModel({ id: 'test/a' })
      const modelB = makeModel({ id: 'test/b' })

      tracker.record(modelA, makeUsage({ inputTokens: 1_000_000 }))
      tracker.record(modelA, makeUsage({ inputTokens: 1_000_000 }))
      tracker.record(modelB, makeUsage({ outputTokens: 1_000_000 }))

      const grouped = tracker.byModel()
      expect(grouped['test/a']?.count).toBe(2)
      expect(grouped['test/b']?.count).toBe(1)
    })
  })

  describe('#when reset() is called', () => {
    it('#then clears all entries', () => {
      const tracker = createCostTracker()
      tracker.record(makeModel(), makeUsage({ inputTokens: 1_000_000 }))
      expect(tracker.count).toBe(1)

      tracker.reset()
      expect(tracker.count).toBe(0)
      expect(tracker.total).toBe(0)
    })
  })
})

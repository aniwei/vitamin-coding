import { describe, expect, it } from 'vitest'
import { MemoryManager, planContextBudget } from '../src'

import type { Message } from '@x-mars/ai'

function user(content: string): Message {
  return { role: 'user', content, timestamp: Date.now() }
}

function toolResult(text: string): Message {
  return {
    role: 'tool_result',
    content: [{ type: 'text', text }],
    timestamp: Date.now(),
  }
}

const baseConfig = {
  contextWindow: 1000,
  reservedOutputTokens: 100,
  compaction: {
    enabled: true,
    trigger: ['tokens' as const, 850],
    keepRecent: ['tokens' as const, 200],
    reserveTokens: 100,
  },
  prune: {
    trigger: ['tokens' as const, 500],
    protect: ['tokens' as const, 100],
    minimum: 10,
    protectedTools: [],
    truncateTools: [],
    truncateMaxLength: 100,
  },
  cachedMicro: {
    trigger: ['tokens' as const, 800],
    windowFraction: 0.3,
    maxCacheEntries: 10,
    reserveTokens: 100,
  },
  snip: {
    maxOutputChars: 1000,
    keepHeadLines: 10,
    keepTailLines: 10,
  },
  estimateTokens: (text: string) => text.length,
}

describe('planContextBudget', () => {
  it('returns none below thresholds', () => {
    const plan = planContextBudget([user('small')], baseConfig)

    expect(plan.action).toBe('none')
    expect(plan.shouldProcess).toBe(false)
    expect(plan.shouldCompact).toBe(false)
    expect(plan.remainingInputTokens).toBeGreaterThan(0)
    expect(plan.trace).toContain('action=none reason=below-thresholds')
  })

  it('recommends prune at prune threshold', () => {
    const plan = planContextBudget([user('x'.repeat(520))], baseConfig)

    expect(plan.action).toBe('prune')
    expect(plan.shouldProcess).toBe(true)
    expect(plan.shouldCompact).toBe(false)
  })

  it('recommends compact at compaction threshold', () => {
    const plan = planContextBudget([user('x'.repeat(900))], baseConfig)

    expect(plan.action).toBe('compact')
    expect(plan.shouldCompact).toBe(true)
    expect(plan.compactionTriggerTokens).toBe(850)
  })

  it('prioritizes snip for oversized tool output', () => {
    const plan = planContextBudget([toolResult('x'.repeat(1200))], baseConfig)

    expect(plan.action).toBe('snip')
    expect(plan.trace).toContain('action=snip reason=oversized-tool-output')
  })
})

describe('MemoryManager.planContextBudget', () => {
  it('uses manager defaults and estimator', () => {
    const manager = new MemoryManager({
      summarize: async () => 'summary',
      estimateTokens: (text) => text.length,
      model: { contextWindow: 1000, maxOutput: 100 },
      compaction: { trigger: ['tokens', 850], reserveTokens: 100 },
      prune: { trigger: ['tokens', 500] },
      cachedMicro: { trigger: ['tokens', 800] },
      snip: { maxOutputChars: 1000 },
    })

    const plan = manager.planContextBudget([user('x'.repeat(900))])

    expect(plan.action).toBe('compact')
    expect(plan.reservedOutputTokens).toBe(100)
    expect(plan.availableInputTokens).toBe(900)
  })
})

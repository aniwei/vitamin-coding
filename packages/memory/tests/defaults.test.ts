import { describe, expect, it } from 'vitest'
import { resolveContextSize, computeMemoryDefaults, DEFAULT_COMPACTION_CONFIG, DEFAULT_PRUNE_CONFIG } from '../src/defaults'

describe('resolveContextSize', () => {
  it('#given tokens unit #then returns the value directly', () => {
    expect(resolveContextSize(['tokens', 5000], 200_000)).toBe(5000)
  })

  it('#given fraction unit #then returns floor(contextWindow * fraction)', () => {
    expect(resolveContextSize(['fraction', 0.5], 200_000)).toBe(100_000)
    expect(resolveContextSize(['fraction', 0.85], 200_000)).toBe(170_000)
  })

  it('#given messages unit #then returns the value directly', () => {
    expect(resolveContextSize(['messages', 10], 200_000)).toBe(10)
  })
})

describe('computeMemoryDefaults', () => {
  it('#given a model config #then returns compaction and prune defaults', () => {
    const defaults = computeMemoryDefaults({ contextWindow: 200_000, maxOutput: 16_384 })

    expect(defaults.compaction.enabled).toBe(true)
    expect(defaults.compaction.trigger[0]).toBe('fraction')
    expect(defaults.compaction.keepRecent[0]).toBe('fraction')
    expect(defaults.compaction.reserveTokens).toBeLessThanOrEqual(16_384)

    expect(defaults.prune.trigger[0]).toBe('fraction')
    expect(defaults.prune.protect[0]).toBe('fraction')
    expect(defaults.prune.minimum).toBeGreaterThan(0)
    expect(defaults.prune.truncateTools.length).toBeGreaterThan(0)
  })

  it('#given a small maxOutput #then caps reserveTokens', () => {
    const defaults = computeMemoryDefaults({ contextWindow: 200_000, maxOutput: 1000 })
    expect(defaults.compaction.reserveTokens).toBe(1000)
  })
})

describe('DEFAULT_COMPACTION_CONFIG', () => {
  it('#then provides all required fields', () => {
    expect(DEFAULT_COMPACTION_CONFIG.enabled).toBe(true)
    expect(DEFAULT_COMPACTION_CONFIG.trigger).toBeDefined()
    expect(DEFAULT_COMPACTION_CONFIG.keepRecent).toBeDefined()
    expect(DEFAULT_COMPACTION_CONFIG.reserveTokens).toBeGreaterThan(0)
  })
})

describe('DEFAULT_PRUNE_CONFIG', () => {
  it('#then provides all required fields', () => {
    expect(DEFAULT_PRUNE_CONFIG.trigger).toBeDefined()
    expect(DEFAULT_PRUNE_CONFIG.protect).toBeDefined()
    expect(DEFAULT_PRUNE_CONFIG.minimum).toBeGreaterThan(0)
    expect(DEFAULT_PRUNE_CONFIG.protectedTools).toEqual([])
    expect(DEFAULT_PRUNE_CONFIG.truncateTools.length).toBeGreaterThan(0)
    expect(DEFAULT_PRUNE_CONFIG.truncateMaxLength).toBeGreaterThan(0)
  })
})

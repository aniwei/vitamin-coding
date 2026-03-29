import { describe, it, expect } from 'vitest'
import {
  createCapabilityStrategy,
  createModelTierStrategy,
  createCompositeRouter,
} from '../src/routing-strategy'
import type { AgentSpec } from '../src/types'
import type { RoutingContext } from '../src/routing-strategy'

const agents: AgentSpec[] = [
  { name: 'coder', description: 'Writes code', model: 'gpt-4', capabilities: ['code', 'refactor'] },
  { name: 'searcher', description: 'Searches', model: 'gpt-4-mini', capabilities: ['search', 'explore'] },
  { name: 'reviewer', description: 'Reviews code', model: 'claude-opus', capabilities: ['review', 'code'] },
  { name: 'quick', description: 'Fast tasks', model: 'gemini-flash', capabilities: ['summarize'] },
]

// ═══ Capability Strategy ═══

describe('createCapabilityStrategy', () => {
  const strategy = createCapabilityStrategy()

  it('selects agent with best capability match', () => {
    const result = strategy.select(agents, {
      prompt: 'test',
      requiredCapabilities: ['code', 'refactor'],
    })

    expect(result).toBeDefined()
    expect(result!.spec.name).toBe('coder')
    expect(result!.score).toBe(1) // 2/2 match
  })

  it('handles partial capability match', () => {
    const result = strategy.select(agents, {
      prompt: 'test',
      requiredCapabilities: ['code', 'search'],
    })

    // coder has code (1/2), searcher has search (1/2), reviewer has code (1/2)
    // any with score 0.5 is valid, as long as score < 1
    expect(result).toBeDefined()
    expect(result!.score).toBe(0.5)
  })

  it('returns first agent as default when no capabilities required', () => {
    const result = strategy.select(agents, { prompt: 'test' })

    expect(result).toBeDefined()
    expect(result!.spec.name).toBe('coder')
    expect(result!.score).toBe(0.5) // default score
  })

  it('returns undefined for empty agent list', () => {
    const result = strategy.select([], {
      prompt: 'test',
      requiredCapabilities: ['code'],
    })

    expect(result).toBeUndefined()
  })

  it('returns undefined when no agent has required capabilities', () => {
    const result = strategy.select(agents, {
      prompt: 'test',
      requiredCapabilities: ['deploy', 'provision'],
    })

    expect(result).toBeUndefined()
  })

  it('prefers agent with higher match ratio', () => {
    const result = strategy.select(agents, {
      prompt: 'test',
      requiredCapabilities: ['review', 'code'],
    })

    // reviewer matches both (2/2 = 1.0), coder matches only code (1/2 = 0.5)
    expect(result!.spec.name).toBe('reviewer')
    expect(result!.score).toBe(1)
  })
})

// ═══ Model Tier Strategy ═══

describe('createModelTierStrategy', () => {
  const strategy = createModelTierStrategy()

  it('selects mini/flash tier for low complexity', () => {
    const result = strategy.select(agents, {
      prompt: 'test',
      complexity: 'low',
    })

    // tier 1 models: gpt-4-mini, gemini-flash
    expect(result).toBeDefined()
    expect(['searcher', 'quick']).toContain(result!.spec.name)
  })

  it('selects standard tier for medium complexity', () => {
    const result = strategy.select(agents, {
      prompt: 'test',
      complexity: 'medium',
    })

    // tier 2 (standard): gpt-4 is tier 2
    expect(result).toBeDefined()
    expect(['coder']).toContain(result!.spec.name)
  })

  it('selects opus/o1 tier for high complexity', () => {
    const result = strategy.select(agents, {
      prompt: 'test',
      complexity: 'high',
    })

    // tier 3 models: claude-opus
    expect(result).toBeDefined()
    expect(result!.spec.name).toBe('reviewer')
  })

  it('defaults to medium complexity when not specified', () => {
    const result = strategy.select(agents, { prompt: 'test' })

    expect(result).toBeDefined()
    // Should prefer tier 2 (standard)
    expect(result!.spec.name).toBe('coder')
  })

  it('handles empty agent list', () => {
    expect(strategy.select([], { prompt: 'test', complexity: 'high' })).toBeUndefined()
  })
})

// ═══ Composite Router ═══

describe('createCompositeRouter', () => {
  it('aggregates scores from multiple strategies', () => {
    const router = createCompositeRouter()
    router.addStrategy(createCapabilityStrategy())
    router.addStrategy(createModelTierStrategy())

    const result = router.route(agents, {
      prompt: 'test',
      requiredCapabilities: ['code', 'review'],
      complexity: 'high',
    })

    // reviewer: capability=1.0 (2/2 match), model_tier=1.0 (opus for high) → total 2.0
    // each strategy only scores its top pick — coder only gets 0.5 from capability
    expect(result).toBeDefined()
    expect(result!.spec.name).toBe('reviewer')
  })

  it('returns undefined for empty agents', () => {
    const router = createCompositeRouter()
    router.addStrategy(createCapabilityStrategy())

    expect(router.route([], { prompt: 'test' })).toBeUndefined()
  })

  it('returns undefined when no strategy provides scores', () => {
    const router = createCompositeRouter()
    // No strategies added → all scores are 0
    const result = router.route(agents, { prompt: 'test' })
    expect(result).toBeUndefined()
  })

  it('removeStrategy removes by name', () => {
    const router = createCompositeRouter()
    const cap = createCapabilityStrategy()
    const tier = createModelTierStrategy()

    router.addStrategy(cap)
    router.addStrategy(tier)
    router.removeStrategy('capability')

    // Only model_tier left
    const result = router.route(agents, {
      prompt: 'test',
      requiredCapabilities: ['code'],
      complexity: 'high',
    })

    expect(result).toBeDefined()
    // Without capability strategy, only model tier matters
    expect(result!.spec.name).toBe('reviewer') // opus for high
  })

  it('combines reasons from all strategies', () => {
    const router = createCompositeRouter()
    router.addStrategy(createCapabilityStrategy())
    router.addStrategy(createModelTierStrategy())

    const result = router.route(agents, {
      prompt: 'test',
      requiredCapabilities: ['code', 'review'],
      complexity: 'high',
    })

    // reviewer wins both strategies so both reasons appear
    expect(result!.reason).toContain('capabilities')
    expect(result!.reason).toContain('model tier')
  })

  it('handles single strategy', () => {
    const router = createCompositeRouter()
    router.addStrategy(createCapabilityStrategy())

    const result = router.route(agents, {
      prompt: 'test',
      requiredCapabilities: ['search', 'explore'],
    })

    expect(result!.spec.name).toBe('searcher')
    expect(result!.score).toBe(1) // perfect match
  })
})

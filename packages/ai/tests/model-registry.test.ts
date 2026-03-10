import { describe, expect, it } from 'vitest'

import { createModelRegistry } from '../src/model-registry'

import type { Model } from '../src/types'

function makeModel(id: string, provider: Model['provider'] = 'openai'): Model {
  return {
    id,
    name: id,
    api: 'openai-completions',
    provider,
    baseUrl: 'https://example.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8000,
    maxOutputTokens: 1000,
  }
}

describe('ModelRegistry', () => {
  it('register/get/find/has work as expected', () => {
    const registry = createModelRegistry()
    registry.register(makeModel('openai/test'))

    expect(registry.has('openai/test')).toBe(true)
    expect(registry.find('openai/test')?.id).toBe('openai/test')
    expect(registry.get('openai/test').id).toBe('openai/test')
  })

  it('filters by provider and supports unregister', () => {
    const registry = createModelRegistry()
    registry.register(makeModel('openai/a', 'openai'))
    registry.register(makeModel('anthropic/b', 'anthropic'))

    expect(registry.getByProvider('openai')).toHaveLength(1)
    expect(registry.getByProvider('anthropic')).toHaveLength(1)

    registry.unregister('openai/a')
    expect(registry.has('openai/a')).toBe(false)
  })

  it('throws when model is not found', () => {
    const registry = createModelRegistry()
    expect(() => registry.get('missing')).toThrow('Model not found')
  })
})

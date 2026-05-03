import { describe, expect, it } from 'vitest'

import { createModelRegistry, createDefaultModelRegistry } from '../src/model-registry'

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

  it('registerMany registers multiple models at once', () => {
    const registry = createModelRegistry()
    registry.registerMany([makeModel('a'), makeModel('b')])
    expect(registry.size).toBe(2)
  })

  it('constructor accepts initial models array', () => {
    const registry = createModelRegistry([makeModel('a'), makeModel('b')])
    expect(registry.size).toBe(2)
    expect(registry.has('a')).toBe(true)
  })

  describe('resolve', () => {
    it('resolves a registered model by string id', () => {
      const registry = createModelRegistry()
      const model = makeModel('openai/gpt-4')
      registry.register(model)

      const resolved = registry.resolve('openai/gpt-4')
      expect(resolved).toBe(model)
    })

    it('resolves a full Model object by passing it through', () => {
      const registry = createModelRegistry()
      const model = makeModel('openai/gpt-4')

      const resolved = registry.resolve(model)
      expect(resolved).toBe(model)
    })

    it('resolves string spec using default model as template', () => {
      const registry = createModelRegistry()
      const defaultModel = makeModel('openai/default')
      registry.setDefault(defaultModel)

      const resolved = registry.resolve('anthropic/claude-4')
      expect(resolved.id).toBe('anthropic/claude-4')
      expect(resolved.provider).toBe('anthropic')
      expect(resolved.name).toBe('claude-4')
      expect(resolved.baseUrl).toBe(defaultModel.baseUrl)
      expect(resolved.contextWindow).toBe(defaultModel.contextWindow)
    })

    it('resolves string without slash using default model', () => {
      const registry = createModelRegistry()
      registry.setDefault(makeModel('openai/default'))

      const resolved = registry.resolve('gpt-4')
      expect(resolved.id).toBe('gpt-4')
      expect(resolved.name).toBe('gpt-4')
    })

    it('resolves { provider, name } spec using default template', () => {
      const registry = createModelRegistry()
      registry.setDefault(makeModel('openai/default'))

      const resolved = registry.resolve({ provider: 'anthropic', name: 'claude-4' })
      expect(resolved.id).toBe('anthropic/claude-4')
      expect(resolved.provider).toBe('anthropic')
    })

    it('resolves { provider, name, api } spec with custom api', () => {
      const registry = createModelRegistry()
      registry.setDefault(makeModel('openai/default'))

      const resolved = registry.resolve({
        provider: 'anthropic',
        name: 'claude-4',
        api: 'anthropic-messages',
      })
      expect(resolved.api).toBe('anthropic-messages')
    })

    it('throws when no match and no default', () => {
      const registry = createModelRegistry()
      expect(() => registry.resolve('missing')).toThrow('Model not found')
    })

    it('registered model takes priority over default template', () => {
      const registry = createModelRegistry()
      const registered = makeModel('anthropic/claude-4', 'anthropic')
      registry.register(registered)
      registry.setDefault(makeModel('openai/default'))

      const resolved = registry.resolve('anthropic/claude-4')
      expect(resolved).toBe(registered)
    })
  })

  describe('tryResolve', () => {
    it('returns undefined instead of throwing', () => {
      const registry = createModelRegistry()
      expect(registry.tryResolve('missing')).toBeUndefined()
    })

    it('returns model when found', () => {
      const registry = createModelRegistry()
      registry.register(makeModel('openai/gpt-4'))
      expect(registry.tryResolve('openai/gpt-4')?.id).toBe('openai/gpt-4')
    })
  })

  describe('setDefault / getDefault', () => {
    it('stores and retrieves default model', () => {
      const registry = createModelRegistry()
      const model = makeModel('openai/default')
      registry.setDefault(model)
      expect(registry.getDefault()).toBe(model)
      expect(registry.has('openai/default')).toBe(true)
    })
  })
})

describe('createDefaultModelRegistry', () => {
  it('includes github-copilot models', () => {
    const registry = createDefaultModelRegistry()
    expect(registry.size).toBeGreaterThanOrEqual(9)
    expect(registry.has('github-copilot/gpt-4.1')).toBe(true)
    expect(registry.has('github-copilot/claude-sonnet-4-20250514')).toBe(true)
    expect(registry.has('github-copilot/gemini-2.5-pro')).toBe(true)
  })

  it('all default models have valid structure', () => {
    const registry = createDefaultModelRegistry()
    for (const model of registry.getAll()) {
      expect(model.id).toBeTruthy()
      expect(model.name).toBeTruthy()
      expect(model.api).toBeTruthy()
      expect(model.provider).toBeTruthy()
      expect(model.baseUrl).toBeTruthy()
      expect(model.contextWindow).toBeGreaterThan(0)
      expect(model.maxOutputTokens).toBeGreaterThan(0)
    }
  })

  it('reasoning models have thinkingLevels', () => {
    const registry = createDefaultModelRegistry()
    const reasoningModels = registry.getAll().filter((m) => m.reasoning)
    expect(reasoningModels.length).toBeGreaterThan(0)
    for (const model of reasoningModels) {
      expect(model.thinkingLevels).toBeDefined()
      expect(model.thinkingLevels!.length).toBeGreaterThan(0)
    }
  })

  it('accepts extra models', () => {
    const extra = makeModel('custom/test', 'custom')
    const registry = createDefaultModelRegistry([extra])
    expect(registry.has('custom/test')).toBe(true)
    expect(registry.has('github-copilot/gpt-4.1')).toBe(true)
  })

  it('resolves copilot model by string id', () => {
    const registry = createDefaultModelRegistry()
    const resolved = registry.resolve('github-copilot/gpt-4.1')
    expect(resolved.name).toBe('gpt-4.1')
    expect(resolved.provider).toBe('github-copilot')
  })
})

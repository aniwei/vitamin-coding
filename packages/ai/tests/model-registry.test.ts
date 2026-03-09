// @vitamin/ai ModelRegistry 测试
import { describe, expect, it } from 'vitest'
import { createModelRegistry } from '../src/model-registry'
import { BUILTIN_MODELS } from '../src/models'

describe('ModelRegistry', () => {
  describe('#given a fresh registry with builtin models', () => {
    describe('#when getAll() is called', () => {
      it('#then returns all builtin models', () => {
        const registry = createModelRegistry()
        const all = registry.getAll()
        expect(all.length).toBeGreaterThan(0)
        expect(all.length).toBe(BUILTIN_MODELS.length)
      })
    })

    describe('#when get() with known model id', () => {
      it('#then returns the model', () => {
        const registry = createModelRegistry()
        const first = BUILTIN_MODELS[0]
        expect(first).toBeDefined()
        const model = registry.get(first.id)
        expect(model.id).toBe(first.id)
      })
    })

    describe('#when get() with unknown model id', () => {
      it('#then throws ProviderError', () => {
        const registry = createModelRegistry()
        expect(() => registry.get('nonexistent-model')).toThrow('Model not found')
      })
    })

    describe('#when find() with known model id', () => {
      it('#then returns the model', () => {
        const registry = createModelRegistry()
        const first = BUILTIN_MODELS[0]
        expect(first).toBeDefined()
        const model = registry.find(first.id)
        expect(model).toBeDefined()
        expect(model?.id).toBe(first.id)
      })
    })

    describe('#when find() with unknown model id', () => {
      it('#then returns undefined', () => {
        const registry = createModelRegistry()
        expect(registry.find('no-such-model')).toBeUndefined()
      })
    })

    describe('#when getByProvider(anthropic)', () => {
      it('#then returns only anthropic models', () => {
        const registry = createModelRegistry()
        const models = registry.getByProvider('anthropic')
        expect(models.length).toBeGreaterThan(0)
        for (const model of models) {
          expect(model.provider).toBe('anthropic')
        }
      })
    })

    describe('#when has() is called', () => {
      it('#then returns true for known / false for unknown', () => {
        const registry = createModelRegistry()
        const first = BUILTIN_MODELS[0]
        expect(first).toBeDefined()
        expect(registry.has(first.id)).toBe(true)
        expect(registry.has('fake')).toBe(false)
      })
    })
  })

  describe('#given a registry with custom model registered', () => {
    describe('#when register() and get()', () => {
      it('#then custom model is retrievable', () => {
        const registry = createModelRegistry()
        registry.register({
          id: 'custom-model',
          name: 'Custom Model',
          provider: 'openai',
          api: 'openai-completions',
          maxContextTokens: 4000,
          maxOutputTokens: 1000,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        })

        const model = registry.get('custom-model')
        expect(model.name).toBe('Custom Model')
        expect(registry.size).toBe(BUILTIN_MODELS.length + 1)
      })
    })

    describe('#when unregister() is called', () => {
      it('#then model is removed', () => {
        const registry = createModelRegistry()
        registry.register({
          id: 'temp-model',
          name: 'Temp',
          provider: 'openai',
          api: 'openai-completions',
          maxContextTokens: 4000,
          maxOutputTokens: 1000,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        })
        expect(registry.has('temp-model')).toBe(true)
        registry.unregister('temp-model')
        expect(registry.has('temp-model')).toBe(false)
      })
    })
  })
})

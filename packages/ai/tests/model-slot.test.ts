import { describe, expect, it } from 'vitest'
import { ModelSlot, createModelSlot } from '../src/model-slot-resolver'
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

describe('ModelSlot', () => {
  describe('#resolve without slot argument', () => {
    it('#returns the default model', () => {
      const registry = createModelRegistry()
      const defaultModel = makeModel('openai/gpt-4')
      registry.register(defaultModel)

      const slot = new ModelSlot({ slots: {}, default: 'openai/gpt-4' }, registry)
      const resolved = slot.resolve()
      expect(resolved.id).toBe('openai/gpt-4')
    })
  })

  describe('#resolve with a defined slot', () => {
    it('#returns the model for that slot', () => {
      const registry = createModelRegistry()
      registry.register(makeModel('openai/gpt-4'))
      registry.register(makeModel('openai/gpt-4o-mini'))

      const slot = new ModelSlot(
        { slots: { compact: 'openai/gpt-4o-mini' }, default: 'openai/gpt-4' },
        registry,
      )
      const resolved = slot.resolve('compact')
      expect(resolved.id).toBe('openai/gpt-4o-mini')
    })
  })

  describe('#resolve with an undefined slot', () => {
    it('#falls back to default model', () => {
      const registry = createModelRegistry()
      registry.register(makeModel('openai/gpt-4'))

      const slot = new ModelSlot({ slots: {}, default: 'openai/gpt-4' }, registry)
      const resolved = slot.resolve('thinking')
      expect(resolved.id).toBe('openai/gpt-4')
    })
  })

  describe('#resolve with array of specs', () => {
    it('#returns the first resolvable model', () => {
      const registry = createModelRegistry()
      registry.register(makeModel('openai/gpt-4o'))

      const slot = new ModelSlot(
        {
          slots: { thinking: ['anthropic/nonexistent', 'openai/gpt-4o'] },
          default: 'openai/gpt-4o',
        },
        registry,
      )
      const resolved = slot.resolve('thinking')
      expect(resolved.id).toBe('openai/gpt-4o')
    })

    it('#falls back to default when none in array can resolve', () => {
      const registry = createModelRegistry()
      registry.register(makeModel('openai/gpt-4'))

      const slot = new ModelSlot(
        {
          slots: { vision: ['anthropic/nonexistent', 'google/nonexistent'] },
          default: 'openai/gpt-4',
        },
        registry,
      )
      const resolved = slot.resolve('vision')
      expect(resolved.id).toBe('openai/gpt-4')
    })
  })

  describe('#resolve with all valid slot names', () => {
    it('#each slot name resolves correctly', () => {
      const registry = createModelRegistry()
      const model = makeModel('openai/default')
      registry.register(model)
      const slotNames = ['normal', 'thinking', 'compact', 'critique', 'vision'] as const

      for (const name of slotNames) {
        const ms = new ModelSlot(
          { slots: { [name]: 'openai/default' }, default: 'openai/default' },
          registry,
        )
        expect(ms.resolve(name).id).toBe('openai/default')
      }
    })
  })
})

describe('createModelSlot', () => {
  it('#creates ModelSlot instance via factory', () => {
    const registry = createModelRegistry()
    registry.register(makeModel('openai/gpt-4'))

    const slot = createModelSlot({ slots: {}, default: 'openai/gpt-4' }, registry)
    expect(slot).toBeInstanceOf(ModelSlot)
    expect(slot.resolve().id).toBe('openai/gpt-4')
  })
})

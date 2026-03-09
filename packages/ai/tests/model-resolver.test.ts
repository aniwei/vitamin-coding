// @vitamin/ai model-resolver 测试
import { describe, expect, it } from 'vitest'
import {
  BUILTIN_CATEGORIES,
  SYSTEM_FALLBACK_CHAIN,
  modelMeetsRequirements,
  resolveModel,
} from '../src/model-resolver'

import type { Category } from '../src/model-resolver'
import type { Model } from '../src/types'

// 测试用模型工厂
function makeModel(id: string, overrides: Partial<Model> = {}): Model {
  return {
    id,
    name: id,
    api: 'openai-completions',
    provider: 'openai',
    baseUrl: 'https://example.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxOutputTokens: 4096,
    ...overrides,
  }
}

describe('resolveModel', () => {
  describe('#given user override that is available', () => {
    it('#then returns the overridden model', () => {
      const models = [makeModel('a'), makeModel('b')]
      const config = { categories: { general: { model: 'b' } } }
      const result = resolveModel('general', config, models)
      expect(result.id).toBe('b')
    })
  })

  describe('#given user override that is NOT available', () => {
    it('#then falls through to category defaults', () => {
      // general preferredModels 第一项是 anthropic/claude-opus-4-6
      const models = [makeModel('anthropic/claude-opus-4-6')]
      const config = { categories: { general: { model: 'unavailable-model' } } }
      const result = resolveModel('general', config, models)
      expect(result.id).toBe('anthropic/claude-opus-4-6')
    })
  })

  describe('#given no override and category preferred model available', () => {
    it('#then returns first preferred model', () => {
      const quickCategory = BUILTIN_CATEGORIES.quick
      const preferred = quickCategory?.preferredModels[0] ?? 'anthropic/claude-haiku-4-5'
      const models = [makeModel(preferred)]
      const result = resolveModel('quick', {}, models)
      expect(result.id).toBe(preferred)
    })
  })

  describe('#given no override and no preferred available', () => {
    it('#then falls through to system fallback chain', () => {
      const fallbackId = SYSTEM_FALLBACK_CHAIN[0] ?? 'anthropic/claude-sonnet-4-6'
      const models = [makeModel(fallbackId)]
      const result = resolveModel('general', {}, models)
      expect(result.id).toBe(fallbackId)
    })
  })

  describe('#given no models match at all', () => {
    it('#then throws ProviderError', () => {
      expect(() => resolveModel('general', {}, [])).toThrow('No available model')
    })
  })
})

describe('modelMeetsRequirements', () => {
  describe('#given category with no requirements', () => {
    it('#then any model passes', () => {
      const cat: Category = { name: 'x', description: 'x', preferredModels: [] }
      expect(modelMeetsRequirements(makeModel('a'), cat)).toBe(true)
    })
  })

  describe('#given reasoning requirement', () => {
    it('#then non-reasoning model fails', () => {
      const cat: Category = {
        name: 'x',
        description: 'x',
        preferredModels: [],
        requirements: { reasoning: true },
      }
      expect(modelMeetsRequirements(makeModel('a', { reasoning: false }), cat)).toBe(false)
      expect(modelMeetsRequirements(makeModel('a', { reasoning: true }), cat)).toBe(true)
    })
  })

  describe('#given multimodal requirement', () => {
    it('#then text-only model fails', () => {
      const cat: Category = {
        name: 'x',
        description: 'x',
        preferredModels: [],
        requirements: { multimodal: true },
      }
      expect(modelMeetsRequirements(makeModel('a', { input: ['text'] }), cat)).toBe(false)
      expect(modelMeetsRequirements(makeModel('a', { input: ['text', 'image'] }), cat)).toBe(true)
    })
  })

  describe('#given minContextWindow requirement', () => {
    it('#then model with smaller context fails', () => {
      const cat: Category = {
        name: 'x',
        description: 'x',
        preferredModels: [],
        requirements: { minContextWindow: 100000 },
      }
      expect(modelMeetsRequirements(makeModel('a', { contextWindow: 50000 }), cat)).toBe(false)
      expect(modelMeetsRequirements(makeModel('a', { contextWindow: 200000 }), cat)).toBe(true)
    })
  })
})

// GitHub Copilot Provider 适配器测试
import { describe, expect, it } from 'vitest'

import { createCopilotProvider } from '../src/providers/github-copilot'
import { BUILTIN_MODELS } from '../src/models'

import type { ProviderAdapter } from '../src/providers/types'
import type { Model, StreamContext, StreamEvent, StreamOptions } from '../src/types'

// 测试用 Copilot 模型
function getCopilotModel(): Model {
  const model = BUILTIN_MODELS.find((m) => m.id === 'github-copilot/gpt-4.1')
  if (!model) throw new Error('Copilot model not found in BUILTIN_MODELS')
  return model
}

describe('GitHub Copilot Provider', () => {
  describe('#given createCopilotProvider is called', () => {
    describe('#when provider is created', () => {
      it('#then returns ProviderAdapter with correct id and displayName', () => {
        const provider = createCopilotProvider()

        expect(provider.id).toBe('github-copilot')
        expect(provider.displayName).toBe('GitHub Copilot')
        expect(typeof provider.stream).toBe('function')
        expect(typeof provider.healthCheck).toBe('function')
      })
    })
  })

  describe('#given Copilot models in BUILTIN_MODELS', () => {
    describe('#when filtering by provider', () => {
      it('#then contains expected Copilot models', () => {
        const copilotModels = BUILTIN_MODELS.filter((m) => m.provider === 'github-copilot')

        expect(copilotModels.length).toBeGreaterThanOrEqual(5)

        const modelIds = copilotModels.map((m) => m.id)
        expect(modelIds).toContain('github-copilot/gpt-4.1')
        expect(modelIds).toContain('github-copilot/gpt-4o')
        expect(modelIds).toContain('github-copilot/o4-mini')
        expect(modelIds).toContain('github-copilot/claude-sonnet-4')
        expect(modelIds).toContain('github-copilot/gemini-2.5-pro')
      })
    })

    describe('#when checking model properties', () => {
      it('#then all Copilot models use github-copilot api type', () => {
        const copilotModels = BUILTIN_MODELS.filter((m) => m.provider === 'github-copilot')

        for (const model of copilotModels) {
          expect(model.api).toBe('github-copilot')
          expect(model.baseUrl).toBe('https://api.githubcopilot.com')
          expect(model.cost.input).toBe(0)
          expect(model.cost.output).toBe(0)
        }
      })
    })

    describe('#when checking reasoning models', () => {
      it('#then o4-mini and claude-sonnet-4 support reasoning', () => {
        const o4Mini = BUILTIN_MODELS.find((m) => m.id === 'github-copilot/o4-mini')
        const claudeSonnet = BUILTIN_MODELS.find((m) => m.id === 'github-copilot/claude-sonnet-4')

        expect(o4Mini?.reasoning).toBe(true)
        expect(o4Mini?.thinkingLevels).toEqual(['low', 'medium', 'high'])

        expect(claudeSonnet?.reasoning).toBe(true)
        expect(claudeSonnet?.thinkingLevels).toEqual(['low', 'medium', 'high'])
      })
    })
  })

  describe('#given provider adapter interface', () => {
    describe('#when checking ProviderAdapter contract', () => {
      it('#then provider implements all required fields', () => {
        const provider: ProviderAdapter = createCopilotProvider()

        expect(provider).toHaveProperty('id')
        expect(provider).toHaveProperty('displayName')
        expect(provider).toHaveProperty('stream')
        expect(provider).toHaveProperty('healthCheck')
      })
    })
  })

  describe('#given Copilot model with baseUrl', () => {
    describe('#when checking model baseUrl', () => {
      it('#then uses api.githubcopilot.com', () => {
        const model = getCopilotModel()
        expect(model.baseUrl).toBe('https://api.githubcopilot.com')
      })
    })
  })
})

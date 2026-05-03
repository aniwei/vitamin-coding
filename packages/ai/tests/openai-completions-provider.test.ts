import { describe, expect, it } from 'vitest'

import { createOpenAICompletionsProvider } from '../src/provider/openai-completions'

import type { Model } from '../src/types'

function makeDeepSeekModel(): Model {
  return {
    id: 'deepseek/deepseek-v4-flash',
    name: 'deepseek-v4-flash',
    api: 'openai-completions',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1000000,
    maxOutputTokens: 384000,
  }
}

describe('OpenAI Compatible Provider', () => {
  it('resolveKey uses provider-specific resolver', async () => {
    const provider = createOpenAICompletionsProvider({
      resolveKey: async (model) => (model.provider === 'deepseek' ? 'deepseek-token' : undefined),
    })

    const key = await provider.resolveKey?.(makeDeepSeekModel())
    expect(key).toBe('deepseek-token')
  })

  it('exposes provider identity and converse function', () => {
    const provider = createOpenAICompletionsProvider()

    expect(provider.id).toBe('openai-completions')
    expect(provider.displayName).toBe('OpenAI Compatible')
    expect(typeof provider.converse).toBe('function')
  })

  it('resolveKey throws when resolver returns undefined', async () => {
    const provider = createOpenAICompletionsProvider({
      resolveKey: async () => undefined,
    })

    await expect(provider.resolveKey?.(makeDeepSeekModel())).rejects.toThrow(
      'Missing deepseek API key',
    )
  })
})

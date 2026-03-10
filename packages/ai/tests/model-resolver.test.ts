import { describe, expect, it } from 'vitest'

import { isClaudeFamily, isGeminiFamily, isGptFamily } from '../src/types'

import type { Model } from '../src/types'

function makeModel(api: Model['api'], provider: Model['provider']): Model {
  return {
    id: `${provider}/${api}`,
    name: `${provider}/${api}`,
    api,
    provider,
    baseUrl: 'https://example.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 4096,
    maxOutputTokens: 1024,
  }
}

describe('model family helpers', () => {
  it('identifies gpt family', () => {
    expect(isGptFamily(makeModel('openai-completions', 'openai'))).toBe(true)
    expect(isGptFamily(makeModel('anthropic-messages', 'anthropic'))).toBe(false)
  })

  it('identifies claude family', () => {
    expect(isClaudeFamily(makeModel('anthropic-messages', 'anthropic'))).toBe(true)
    expect(isClaudeFamily(makeModel('openai-completions', 'openai'))).toBe(false)
  })

  it('identifies gemini family', () => {
    expect(isGeminiFamily(makeModel('google-generative-ai', 'google'))).toBe(true)
    expect(isGeminiFamily(makeModel('openai-responses', 'openai'))).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import { createCopilotProvider } from '../src/provider/github-copilot'

import type { Model } from '../src/types'

function makeModel(): Model {
  return {
    id: 'github-copilot/gpt-4.1',
    name: 'gpt-4.1',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: 'https://api.githubcopilot.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxOutputTokens: 4096,
  }
}

describe('GitHub Copilot Provider', () => {
  it('exposes provider identity and converse function', () => {
    const provider = createCopilotProvider()
    expect(provider.id).toBe('github-copilot')
    expect(provider.displayName).toBe('GitHub Copilot')
    expect(typeof provider.converse).toBe('function')
  })

  it('resolveKey is available and returns a string', async () => {
    const provider = createCopilotProvider()
    const key = await provider.resolveKey?.(makeModel())
    expect(typeof key).toBe('string')
  })
})

import { describe, expect, it } from 'vitest'

import { createDefaultProviderRegistry, createProviderRegistry } from '../src/provider-registry'

import type { Model, ProviderStream, StreamContext, StreamEvent, StreamOptions } from '../src/types'

function createNoopProvider(id: string): ProviderStream {
  return {
    id,
    displayName: id,
    async *converse(
      _model: Model,
      _context: StreamContext,
      _options: StreamOptions,
      _signal: AbortSignal,
    ): AsyncIterable<StreamEvent> {
      yield* [] as StreamEvent[]
    },
  }
}

describe('ProviderRegistry', () => {
  describe('#given registered factory', () => {
    describe('#when get is called repeatedly', () => {
      it('#then returns cached single instance', () => {
        const registry = createProviderRegistry()
        let created = 0

        registry.register('openai-completions', () => {
          created += 1
          return createNoopProvider('openai-completions')
        })

        const a = registry.get('openai-completions')
        const b = registry.get('openai-completions')

        expect(a).toBe(b)
        expect(created).toBe(1)
      })
    })
  })

  describe('#given an unregistered api type', () => {
    describe('#when get is called', () => {
      it('#then throws provider not registered error', () => {
        const registry = createProviderRegistry()
        expect(() => registry.get('ollama')).toThrow('Provider not registered')
      })
    })
  })

  describe('#given multiple providers', () => {
    describe('#when list and clear are used', () => {
      it('#then reflects registry lifecycle', () => {
        const registry = createProviderRegistry()
        registry.register('ollama', () => createNoopProvider('ollama'))
        registry.register('openai-completions', () => createNoopProvider('openai-completions'))

        expect(registry.has('ollama')).toBe(true)
        expect(registry.list()).toEqual(expect.arrayContaining(['ollama', 'openai-completions']))

        registry.unregister('ollama')
        expect(registry.has('ollama')).toBe(false)

        registry.clear()
        expect(registry.list()).toEqual([])
      })
    })
  })

  describe('#given default registry factory', () => {
    it('#then registers github-copilot provider by default', () => {
      const registry = createDefaultProviderRegistry()

      expect(registry.has('github-copilot')).toBe(true)
      const provider = registry.get('github-copilot')
      expect(provider.id).toBe('github-copilot')
    })

    it('#then can compose with resolveOAuthKey', async () => {
      const registry = createDefaultProviderRegistry({
        resolveOAuthKey: async () => 'oauth-token',
      })
      const provider = registry.get('github-copilot')

      const oldCopilot = process.env['COPILOT_GITHUB_TOKEN']
      const oldGh = process.env['GH_TOKEN']
      const oldGithub = process.env['GITHUB_TOKEN']

      delete process.env['COPILOT_GITHUB_TOKEN']
      delete process.env['GH_TOKEN']
      delete process.env['GITHUB_TOKEN']

      try {
        const key = await provider.resolveKey?.({
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
        })

        expect(key).toBe('oauth-token')
      } finally {
        if (oldCopilot === undefined) delete process.env['COPILOT_GITHUB_TOKEN']
        else process.env['COPILOT_GITHUB_TOKEN'] = oldCopilot

        if (oldGh === undefined) delete process.env['GH_TOKEN']
        else process.env['GH_TOKEN'] = oldGh

        if (oldGithub === undefined) delete process.env['GITHUB_TOKEN']
        else process.env['GITHUB_TOKEN'] = oldGithub
      }
    })
  })
})

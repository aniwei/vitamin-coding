import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createDefaultProviderRegistry, createProviderRegistry } from '../src/provider-registry'
import { createAuthStore } from '../src/auth-store'
import { createModelRegistry } from '../src/model-registry'

import type { Model, ProviderStream, StreamContext, StreamEvent, StreamOptions } from '../src/types'

function makeTempPath(prefix: string): string {
  return join(
    tmpdir(),
    `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  )
}

function makeModel(id: string = 'github-copilot/gpt-4.1'): Model {
  return {
    id,
    name: id.split('/')[1] ?? id,
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

    it('#then can compose with custom auth store', async () => {
      const path = makeTempPath('provider-registry-auth')
      const authStore = createAuthStore({ path })
      try {
        await authStore.setCredentialKey('github-copilot', 'oauth-token')

        const registry = createDefaultProviderRegistry({ authStore })
        const provider = registry.get('github-copilot')
        const key = await provider.resolveKey?.(makeModel())

        expect(key).toBe('oauth-token')
      } finally {
        await rm(path, { force: true })
      }
    })

    it('#then resolveModel delegates to the configured model registry', () => {
      const model = makeModel('github-copilot/test-model')
      const registry = createProviderRegistry({
        modelRegistry: createModelRegistry([model]),
      })

      expect(registry.resolveModel('github-copilot/test-model')).toBe(model)
    })
  })
})

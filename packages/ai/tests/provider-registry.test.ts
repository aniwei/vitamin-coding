import { describe, expect, it } from 'vitest'

import { createProviderRegistry } from '../src/provider-registry'

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
})

import { describe, expect, it } from 'vitest'

import { createProviderRegistry } from '../src/provider-registry'

describe('ProviderRegistry lifecycle', () => {
  it('supports register/get/unregister', () => {
    const registry = createProviderRegistry()

    registry.register('openai-completions', () => ({
      id: 'openai-completions',
      displayName: 'mock',
      async *converse() {
        yield* []
      },
    }))

    expect(registry.has('openai-completions')).toBe(true)
    expect(registry.get('openai-completions').id).toBe('openai-completions')

    registry.unregister('openai-completions')
    expect(registry.has('openai-completions')).toBe(false)
  })

  it('throws for unregistered provider', () => {
    const registry = createProviderRegistry()
    expect(() => registry.get('openai-completions')).toThrow('Provider not registered')
  })
})

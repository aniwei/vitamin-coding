import { describe, expect, it } from 'vitest'

import { createDefaultOAuthRegistry, createOAuthRegistry } from '../src/oauth-registry'
import type { OAuthProvider } from '../src/types'

function makeMockProvider(id: string): OAuthProvider {
  return {
    id,
    name: `mock-${id}`,
    async login() {
      return { refresh: 'r', access: 'a', expires: Date.now() + 60_000 }
    },
    async refreshToken(creds) {
      return { ...creds, access: 'refreshed', expires: Date.now() + 60_000 }
    },
    getApiKey(creds) {
      return creds.access
    },
  }
}

describe('OAuthRegistry', () => {
  it('register/get stores and retrieves provider', () => {
    const registry = createOAuthRegistry()
    const provider = makeMockProvider('github-copilot')

    registry.register(provider)

    const a = registry.get('github-copilot')
    const b = registry.get('github-copilot')
    expect(a).toBe(b)
    expect(a).toBe(provider)
  })

  it('returns undefined when oauth provider not registered', () => {
    const registry = createOAuthRegistry()
    expect(registry.get('github-copilot')).toBeUndefined()
  })

  it('createDefaultOAuthRegistry pre-registers github-copilot oauth', () => {
    const registry = createDefaultOAuthRegistry()
    expect(registry.has('github-copilot')).toBe(true)
    const oauth = registry.get('github-copilot')
    expect(oauth?.id).toBe('github-copilot')
  })

  it('getApiKey refreshes expired credentials and returns key', async () => {
    const registry = createOAuthRegistry()
    registry.register(makeMockProvider('github-copilot'))

    const result = await registry.getApiKey('github-copilot', {
      'github-copilot': { refresh: 'r', access: 'old', expires: 0 },
    })

    expect(result).not.toBeNull()
    expect(result!.apiKey).toBe('refreshed')
    expect(result!.newCredentials.access).toBe('refreshed')
  })

  it('getApiKey returns existing key for non-expired credentials', async () => {
    const registry = createOAuthRegistry()
    registry.register(makeMockProvider('github-copilot'))

    const result = await registry.getApiKey('github-copilot', {
      'github-copilot': { refresh: 'r', access: 'valid-key', expires: Date.now() + 60_000 },
    })

    expect(result).not.toBeNull()
    expect(result!.apiKey).toBe('valid-key')
  })

  it('getApiKey returns null when no credentials exist', async () => {
    const registry = createOAuthRegistry()
    registry.register(makeMockProvider('github-copilot'))

    const result = await registry.getApiKey('github-copilot', {})
    expect(result).toBeNull()
  })

  it('unregister restores built-in provider instead of removing it', () => {
    const registry = createDefaultOAuthRegistry()
    const original = registry.get('github-copilot')

    // 覆盖注册一个自定义的
    const custom = makeMockProvider('github-copilot')
    registry.register(custom)
    expect(registry.get('github-copilot')).toBe(custom)

    // unregister 应恢复内置提供商
    registry.unregister('github-copilot')
    const restored = registry.get('github-copilot')
    expect(restored).toBeDefined()
    expect(restored!.id).toBe('github-copilot')
    expect(restored).toBe(original)
  })

  it('unregister removes custom (non-built-in) provider completely', () => {
    const registry = createDefaultOAuthRegistry()
    const custom = makeMockProvider('my-custom-provider')
    registry.register(custom)
    expect(registry.has('my-custom-provider')).toBe(true)

    registry.unregister('my-custom-provider')
    expect(registry.has('my-custom-provider')).toBe(false)
  })

  it('reset restores all built-in providers and removes custom ones', () => {
    const registry = createDefaultOAuthRegistry()
    const custom = makeMockProvider('my-custom')
    registry.register(custom)
    expect(registry.has('my-custom')).toBe(true)

    registry.reset()
    expect(registry.has('my-custom')).toBe(false)
    expect(registry.has('github-copilot')).toBe(true)
  })
})

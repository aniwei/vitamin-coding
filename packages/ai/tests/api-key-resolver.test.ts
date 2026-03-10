import { describe, expect, it } from 'vitest'

import { createOAuthRegistry } from '../src/oauth-registry'

describe('OAuthRegistry', () => {
  it('register/get caches instances', () => {
    const registry = createOAuthRegistry([])
    let created = 0

    registry.register('github-copilot', () => {
      created += 1
      return {
        id: 'github-copilot',
        displayName: 'mock',
        credentials: undefined,
        async authorize() {
          return {
            type: 'github-copilot',
            refreshToken: '',
            accessToken: '',
            expires: Date.now() + 1000,
          }
        },
        async refresh() {},
        async resolve() {
          return 'token'
        },
      }
    })

    const a = registry.get('github-copilot')
    const b = registry.get('github-copilot')
    expect(a).toBe(b)
    expect(created).toBe(1)
  })

  it('throws when oauth provider not registered', () => {
    const registry = createOAuthRegistry([])
    expect(() => registry.get('github-copilot')).toThrow('OAuth not registered')
  })
})

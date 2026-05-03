import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createAuthStore } from '../src/auth-store'
import { createDefaultOAuthRegistry, createOAuthRegistry } from '../src/oauth-registry'

import type { OAuthCredentials, OAuthProvider } from '../src/types'

function makeTempPath(prefix: string): string {
  return join(
    tmpdir(),
    `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  )
}

async function cleanupPath(path: string): Promise<void> {
  await rm(path, { force: true })
}

function makeMockProvider(
  id: string,
  options: {
    loginResult?: OAuthCredentials
    refreshToken?: (creds: OAuthCredentials) => Promise<OAuthCredentials>
    getAccessKey?: (creds: OAuthCredentials) => string
  } = {},
): OAuthProvider {
  return {
    id,
    name: `mock-${id}`,
    async login() {
      return options.loginResult ?? { refresh: 'r', access: 'a', expires: Date.now() + 60_000 }
    },
    async refreshToken(creds) {
      if (options.refreshToken) {
        return options.refreshToken(creds)
      }
      return { ...creds, access: 'refreshed', expires: Date.now() + 60_000 }
    },
    getAccessKey(creds) {
      return options.getAccessKey?.(creds) ?? creds.access
    },
  }
}

describe('OAuthRegistry', () => {
  it('register/get/list stores and retrieves provider', () => {
    const registry = createOAuthRegistry()
    const provider = makeMockProvider('github-copilot')

    registry.register(provider)

    const a = registry.get('github-copilot')
    const b = registry.get('github-copilot')
    expect(a).toBe(b)
    expect(a).toBe(provider)
    expect(registry.list()).toEqual([provider])
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

  it('getAccessKey refreshes expired credentials and returns updated credentials', async () => {
    const registry = createOAuthRegistry()
    registry.register(makeMockProvider('github-copilot'))

    const result = await registry.getAccessKey('github-copilot', {
      'github-copilot': { refresh: 'r', access: 'old', expires: 0 },
    })

    expect(result).not.toBeNull()
    expect(result?.accessKey).toBe('refreshed')
    expect(result?.credentials.access).toBe('refreshed')
    expect(result?.credentials.expires).toBeGreaterThan(Date.now())
  })

  it('getAccessKey returns existing key for non-expired credentials', async () => {
    const registry = createOAuthRegistry()
    registry.register(makeMockProvider('github-copilot'))
    const credentials = {
      refresh: 'r',
      access: 'valid-key',
      expires: Date.now() + 60_000,
    }

    const result = await registry.getAccessKey('github-copilot', {
      'github-copilot': credentials,
    })

    expect(result).toEqual({
      accessKey: 'valid-key',
      credentials,
    })
  })

  it('getAccessKey returns null when no credentials exist', async () => {
    const registry = createOAuthRegistry()
    registry.register(makeMockProvider('github-copilot'))

    const result = await registry.getAccessKey('github-copilot', {})
    expect(result).toBeNull()
  })

  it('unregister removes built-in and custom providers alike', () => {
    const registry = createDefaultOAuthRegistry()
    registry.register(makeMockProvider('my-custom-provider'))

    registry.unregister('github-copilot')
    registry.unregister('my-custom-provider')

    expect(registry.has('github-copilot')).toBe(false)
    expect(registry.has('my-custom-provider')).toBe(false)
  })

  it('reset clears all registered providers', () => {
    const registry = createDefaultOAuthRegistry()
    registry.register(makeMockProvider('my-custom'))

    registry.reset()

    expect(registry.list()).toEqual([])
  })
})

describe('AuthStore', () => {
  it('persists api key credentials to disk and loads them back', async () => {
    const path = makeTempPath('x-mars-ai-auth-store')
    const store = createAuthStore({ path })

    try {
      await store.setCredentialKey('openai', 'test-key')
      await store.save()

      const reloaded = createAuthStore({ path })
      await expect(reloaded.getCredentialKey('openai')).resolves.toBe('test-key')

      const raw = JSON.parse(await readFile(path, 'utf-8')) as Record<string, unknown>
      expect(raw['openai']).toEqual({ type: 'api_key', key: 'test-key' })
    } finally {
      await cleanupPath(path)
    }
  })

  it('refreshes expired oauth credentials and persists the refreshed value', async () => {
    const path = makeTempPath('x-mars-ai-oauth-store')
    const oauth = createOAuthRegistry()
    oauth.register(
      makeMockProvider('github-copilot', {
        refreshToken: async (creds) => ({
          ...creds,
          access: 'fresh-access',
          expires: Date.now() + 60_000,
        }),
      }),
    )
    const store = createAuthStore({ path, oauth })

    try {
      await store.setCredentialKey('github-copilot', {
        refresh: 'refresh-token',
        access: 'expired-access',
        expires: 0,
      })
      await store.save()

      await expect(store.getCredentialKey('github-copilot')).resolves.toBe('fresh-access')

      const raw = JSON.parse(await readFile(path, 'utf-8')) as Record<
        string,
        OAuthCredentials & { type: string }
      >
      expect(raw['github-copilot']).toMatchObject({
        type: 'oauth',
        refresh: 'refresh-token',
        access: 'fresh-access',
      })
    } finally {
      await cleanupPath(path)
    }
  })

  it('falls back to configured env variable when no stored credential exists', async () => {
    const path = makeTempPath('x-mars-ai-auth-env')
    const keyName = 'X_MARS_AI_TEST_OPENAI_KEY'
    const previous = process.env[keyName]
    process.env[keyName] = 'env-key'

    try {
      const store = createAuthStore({
        path,
        env: { openai: keyName },
      })

      await expect(store.getCredentialKey('openai')).resolves.toBe('env-key')
      await expect(store.hasCredential('openai')).resolves.toBe(true)
    } finally {
      if (previous === undefined) {
        delete process.env[keyName]
      } else {
        process.env[keyName] = previous
      }

      await cleanupPath(path)
    }
  })
})

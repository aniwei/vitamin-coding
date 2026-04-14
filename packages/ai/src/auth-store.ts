import { createLogger } from '@vitamin/shared'
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises'
import { dirname } from 'node:path'
import { AUTH_PATH } from '@vitamin/env'
import { OAuthRegistry, createDefaultOAuthRegistry } from './oauth-registry'

import type { OAuthCredentials, OAuthLoginOptions, Provider } from './types'

export type ApiKeyEntry = {
  type: 'api_key'
  key: string
  baseUrl?: string
}

export type OAuthEntry = {
  type: 'oauth'
} & OAuthCredentials

export type AuthEntry = ApiKeyEntry | OAuthEntry

export type AuthFileData = Record<string, AuthEntry>

export interface AuthStoreOptions {
  path?: string
  env?: Record<string, string>
  oauth?: OAuthRegistry
}

const logger = createLogger('@vitamin/ai:auth-store')

export class AuthStore {
  private readonly cache = new Map<string, AuthEntry>()
  private loaded = false
  private dirty = false

  readonly oauth: OAuthRegistry

  readonly path: string
  private readonly env: Map<string, string>

  constructor(options: AuthStoreOptions = {}) {
    this.path = options.path ?? AUTH_PATH
    this.env = new Map(Object.entries(options.env ?? {}))
    this.oauth = options.oauth ?? createDefaultOAuthRegistry()
  }

  async getCredentialKey(provider: Provider): Promise<string | null> {
    await this.ensureInitialized()
    const entry = this.cache.get(provider)

    if (entry?.type === 'api_key') {
      return entry.key
    }
    if (entry?.type === 'oauth') {
      return this.resolveOAuthAccessKey(provider, entry)
    }

    const env = this.env.get(provider)
    if (env) {
      const key = process.env[env]
      if (key) {
        return key
      }
    }

    return null
  }

  async hasCredential(provider: Provider): Promise<boolean> {
    await this.ensureInitialized()
    if (this.cache.has(provider)) {
      return true
    }

    const env = this.env.get(provider)
    return !!(env && process.env[env])
  }

  async getBaseUrl(provider: Provider): Promise<string | null> {
    await this.ensureInitialized()
    const entry = this.cache.get(provider)
    if (entry?.type === 'api_key' && entry.baseUrl) {
      return entry.baseUrl
    }
    return null
  }

  async setCredentialKey(provider: Provider, credentials: string): Promise<void>
  async setCredentialKey(provider: Provider, credentials: OAuthCredentials): Promise<void>
  async setCredentialKey(
    provider: Provider,
    credentials: string | OAuthCredentials,
  ): Promise<void> {
    await this.ensureInitialized()

    this.cache.set(
      provider,
      typeof credentials === 'string'
        ? { type: 'api_key', key: credentials }
        : { type: 'oauth', ...credentials },
    )

    this.dirty = true
  }

  remove(provider: Provider): void {
    this.cache?.delete(provider)
    this.dirty = true
  }

  async login(provider: Provider, options: OAuthLoginOptions): Promise<OAuthCredentials> {
    const oauth = this.oauth.get(provider)
    if (!oauth) {
      throw new Error(`No OAuth provider registered for: ${provider}`)
    }

    const credentials = await oauth.login(options)
    this.setCredentialKey(provider, credentials)
    await this.save()

    return credentials
  }

  async logout(provider: Provider): Promise<void> {
    this.remove(provider)
    await this.save()
  }

  async save(): Promise<void> {
    if (!this.dirty) {
      return
    }

    const obj: AuthFileData = {}
    for (const [k, v] of this.cache) {
      obj[k] = v
    }

    const dir = dirname(this.path)
    await mkdir(dir, { recursive: true })
    await writeFile(this.path, JSON.stringify(obj, null, 2), 'utf-8')

    try {
      await chmod(this.path, 0o600)
    } catch {
      //
    }

    this.dirty = false
  }

  get isDirty(): boolean {
    return this.dirty
  }

  private async resolveOAuthAccessKey(
    provider: Provider,
    entry: OAuthEntry,
  ): Promise<string | null> {
    const oauthProvider = this.oauth.get(provider)
    if (!oauthProvider) {
      return null
    }

    if (Date.now() < entry.expires) {
      return oauthProvider.getAccessKey(entry)
    }

    try {
      const refreshed = await oauthProvider.refreshToken(entry)
      this.cache.set(provider, { type: 'oauth', ...refreshed })
      this.dirty = true
      await this.save()
      return oauthProvider.getAccessKey(refreshed)
    } catch {
      return null
    }
  }

  async ensureInitialized(): Promise<void> {
    if (this.loaded) {
      return
    }
    this.loaded = true

    try {
      const raw = await readFile(this.path, 'utf-8')
      const data = JSON.parse(raw) as Record<string, AuthEntry>
      for (const [k, v] of Object.entries(data)) {
        if (!this.cache.has(k)) {
          this.cache.set(k, v)
        }
      }
    } catch {
      logger.warn(`Failed to load auth data from ${this.path}`)
    }
  }
}

export function createAuthStore(options: AuthStoreOptions = {}): AuthStore {
  return new AuthStore(options)
}

export function createDefaultAuthStore(options: AuthStoreOptions = {}): AuthStore {
  return new AuthStore({
    env: {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      'github-copilot': 'COPILOT_GITHUB_TOKEN',
      ...options.env,
    },
    ...options,
  })
}

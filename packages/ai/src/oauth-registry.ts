import { OAuthError } from '@vitamin/shared'
import { GitHubCopilotOAuthProvider } from './oauth/github-copilot'
import type { OAuthCredentials, OAuthProvider, OAuthProviderId } from './types'

export class OAuthRegistry {
  private readonly providers = new Map<OAuthProviderId, OAuthProvider>()

  register(provider: OAuthProvider): void {
    this.providers.set(provider.id, provider)
  }

  get(id: OAuthProviderId): OAuthProvider | undefined {
    return this.providers.get(id)
  }

  has(id: OAuthProviderId): boolean {
    return this.providers.has(id)
  }

  list(): OAuthProvider[] {
    return [...this.providers.values()]
  }

  unregister(id: OAuthProviderId): void {
    this.providers.delete(id)
  }

  reset(): void {
    this.providers.clear()
  }

  clear(): void {
    this.providers.clear()
  }

  async getAccessKey(
    providerId: OAuthProviderId,
    credentials: Record<string, OAuthCredentials>,
  ): Promise<{ accessKey: string; credentials: OAuthCredentials } | null> {
    const provider = this.get(providerId)
    if (!provider) {
      throw new OAuthError(`Unknown OAuth provider: ${providerId}`, {
        code: 'OAUTH_NOT_FOUND',
      })
    }

    let creds = credentials[providerId]
    if (!creds) return null

    if (Date.now() >= creds.expires) {
      creds = await provider.refreshToken(creds)
    }

    const accessKey = provider.getAccessKey(creds)
    return { accessKey, credentials: creds }
  }
}

function registerBuiltInProviders(registry: OAuthRegistry): void {
  registry.register(new GitHubCopilotOAuthProvider())
}

export function createOAuthRegistry(): OAuthRegistry {
  return new OAuthRegistry()
}

export function createDefaultOAuthRegistry(): OAuthRegistry {
  const registry = createOAuthRegistry()
  registerBuiltInProviders(registry)

  return registry
}

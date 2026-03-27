// OAuth 提供商注册表 — 管理所有 OAuth 提供商适配器
import { OAuthError } from '@vitamin/shared'

import { GitHubCopilotOAuthProvider } from './oauth/github-copilot'

import type { OAuthCredentials, OAuthProvider, OAuthProviderId } from './types'


// OAuth 注册表
export class OAuthRegistry {
  private readonly providers = new Map<OAuthProviderId, OAuthProvider>()

  // 注册 OAuth 提供商
  register(provider: OAuthProvider): void {
    this.providers.set(provider.id, provider)
  }

  // 获取 OAuth 提供商
  get(id: OAuthProviderId): OAuthProvider | undefined {
    return this.providers.get(id)
  }

  // 检查是否已注册
  has(id: OAuthProviderId): boolean {
    return this.providers.has(id)
  }

  // 列出所有已注册的
  list(): OAuthProvider[] {
    return [...this.providers.values()]
  }

  // 移除 OAuth 注册。
  unregister(id: OAuthProviderId): void {
    this.providers.delete(id)
  }

  // 重置为内置提供商列表，移除所有自定义注册。
  reset(): void {
    this.providers.clear()
  }

  // 清除所有注册
  clear(): void {
    this.providers.clear()
  }

  // 高级 API：获取 provider 的 Access key，自动刷新过期 token
  // @returns Access key 和更新后的凭据，或 null（无凭据）
  async getAccessKey(
    providerId: OAuthProviderId,
    credentials: Record<string, OAuthCredentials>,
  ): Promise<{ accessKey: string, credentials: OAuthCredentials } | null> {
    const provider = this.get(providerId)
    if (!provider) {
      throw new OAuthError(`Unknown OAuth provider: ${providerId}`, {
        code: 'OAUTH_NOT_FOUND',
      })
    }

    let creds = credentials[providerId]
    if (!creds) return null

    // 过期则刷新
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

// 创建空的 OAuth 注册表
export function createOAuthRegistry(): OAuthRegistry {
  return new OAuthRegistry()
}

// 创建带默认注册的 OAuth 注册表
export function createDefaultOAuthRegistry(): OAuthRegistry {
  const registry = createOAuthRegistry()
  
  registerBuiltInProviders(registry)

  return registry
}


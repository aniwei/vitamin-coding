// Provider 注册表 — 管理所有 LLM 提供商适配器
import { OAuthError } from '@vitamin/shared'

import type { Api, OAuthCredentials } from './types'
import type { OAuth, OAuthFactory } from './types'

// OAuth 注册表
export class OAuthRegistry {
  private readonly factories = new Map<Api, OAuthFactory>()
  private readonly instances = new Map<Api, OAuth>()
  private readonly stores = new Map<Api, OAuthCredentials>()

  constructor(stores: OAuthCredentials[]) {
    for (const store of stores) {
      this.stores.set(store.type as Api, store)
    }
  }

  // 注册 OAuth 工厂
  register(api: Api, factory: OAuthFactory): void {
    this.factories.set(api, factory)
    
    // 如果有则清除缓存实例
    if (this.instances.has(api)) {
      this.instances.delete(api)
    }
  }

  // 惰性创建 OAuth 实例
  get(api: Api): OAuth {
    const cached = this.instances.get(api)
    if (cached) return cached

    const factory = this.factories.get(api)
    if (!factory) {
      throw new OAuthError(`OAuth not registered, api: ${api}`, {
        code: 'OAUTH_NOT_FOUND',
      })
    }

    const instance = factory()
    this.instances.set(api, instance)
    return instance
  }

  // 检查 OAuth 是否已注册
  has(api: Api): boolean {
    return this.factories.has(api)
  }

  // 列出所有已注册的
  list(): Api[] {
    return [...this.factories.keys()]
  }

  // 移除 OAuth 注册
  unregister(api: Api): void {
    this.factories.delete(api)
    this.instances.delete(api)
  }

  // 清除所有注册
  clear(): void {
    this.factories.clear()
    this.instances.clear()
  }
}

// 创建 OAuth 注册表
export function createOAuthRegistry(stores: OAuthCredentials[]): OAuthRegistry {
  return new OAuthRegistry(stores)
}


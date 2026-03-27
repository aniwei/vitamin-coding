import { ProviderError } from '@vitamin/shared'
import { createCopilotProvider } from './provider/github-copilot'
import type { CopilotCredentialResolver } from './provider/github-copilot'

import {
  createDefaultAuthStore,
} from './auth-store'
import type { AuthStore } from './auth-store'

import type { Api, Provider } from './types'
import type { ProviderStream, ProviderFactory } from './types'

// Provider 注册表
export class ProviderRegistry {
  private readonly factories = new Map<Api, ProviderFactory>()
  private readonly instances = new Map<Api, ProviderStream>()

  private oauth?: AuthStore

  // 注册 Provider 工厂
  register(api: Api, factory: ProviderFactory): void {
    this.factories.set(api, factory)

    // 如果有则清除缓存实例
    if (this.instances.has(api)) {
      this.instances.delete(api)
    }
  }

  // 惰性创建 Provider 实例
  get(api: Api): ProviderStream {
    const cached = this.instances.get(api)
    if (cached) return cached

    const factory = this.factories.get(api)
    if (!factory) {
      throw new ProviderError(`Provider not registered, api: ${api}`, {
        code: 'PROVIDER_NOT_FOUND',
      })
    }

    const instance = factory()
    this.instances.set(api, instance)
    return instance
  }

  // 检查 Provider 是否已注册
  has(api: Api): boolean {
    return this.factories.has(api)
  }

  // 列出所有已注册的 API 类型
  list(): Api[] {
    return [...this.factories.keys()]
  }

  // 移除 Provider 注册
  unregister(api: Api): void {
    this.factories.delete(api)
    this.instances.delete(api)
  }

  // 清除所有注册
  clear(): void {
    this.factories.clear()
    this.instances.clear()
  }

  // 设置统一凭据存储。
  // AuthStore 的解析优先级高于旧版 AccessKeyResolver。
  setAuthStore(store: AuthStore): void {
    this.oauth = store
  }


  // 获取当前 AuthStore 实例（若未设置则返回 undefined）。
  // CLI / VitaminApp 可通过此方法调用 login() / logout() 等操作。
  getAuthStore(): AuthStore | undefined {
    return this.oauth
  }

  // 检查指定 provider 是否有可用凭据（快速，不触发刷新）。
  // 用于启动时过滤无凭据的模型，实现 "no key → 触发 login" 流程。
  async hasCredential(provider: Provider): Promise<boolean> {
    if (!this.oauth) return false
    return this.oauth.hasCredential(provider)
  }

  // 解析指定 api/provider 的 access key（AuthStore 优先级链：runtime key → auth.json → env var）
  async resolveAccessKey(api: Api): Promise<string | null> {
    if (!this.oauth) return null
    return this.oauth.getCredentialKey(api)
  }

  // 存储并持久化 access key
  async storeAccessKey(api: Api, key: string): Promise<void> {
    if (!this.oauth) return
    this.oauth.setCredentialKey(api, key)
    await this.oauth.save()
  }
}

// 创建空的 Provider 注册表
export function createProviderRegistry(): ProviderRegistry {
  return new ProviderRegistry()
}

export interface DefaultProviderRegistryOptions {
  // 统一凭据存储
  auth?: AuthStore
}

// 创建带默认 provider 的注册表。
// 无 key 时的流程：
//   1. createDefaultProviderRegistry({ oauth }) 初始化
//   2. registry.hasCredential('github-copilot') → false
//   3. CLI/UI 调用 oauth.login('github-copilot', callbacks)
//   4. AuthStore 自动持久化凭据
//   5. 后续 resolveAccessKey('github-copilot') 正常返回 token
export function createDefaultProviderRegistry(
  options: DefaultProviderRegistryOptions = {},
): ProviderRegistry {
  const registry = createProviderRegistry()

  registry.register('github-copilot', () => {
    const resolveOAuthAccessKey: CopilotCredentialResolver = () => registry.resolveAccessKey('github-copilot').then(k => k ?? undefined)
    return createCopilotProvider({ resolveOAuthAccessKey })
  })

  const oauth = options.auth ?? createDefaultAuthStore()
  registry.setAuthStore(oauth)

  return registry
}

export type { AuthStore }


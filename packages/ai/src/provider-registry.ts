import { ProviderError } from '@vitamin/shared'
import { createCopilotProvider } from './provider/github-copilot'
import type { CopilotCredentialResolver } from './provider/github-copilot'

import {
  createEnvKeyResolver,
  createLocalFileKeyResolver,
  createChainedKeyResolver,
} from './access-key-resolver'
import type { AccessKeyResolver } from './access-key-resolver'

import type { Api } from './types'
import type { ProviderStream, ProviderFactory } from './types'

// Provider 注册表
export class ProviderRegistry {
  private readonly factories = new Map<Api, ProviderFactory>()
  private readonly instances = new Map<Api, ProviderStream>()
  private resolver?: AccessKeyResolver

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

  // ─── Access Key 解析 ──────────────────────────────────────────────────────

  /**
   * 设置 Access Key 解析器
   * 替换当前解析器，不影响已缓存的 Provider 实例
   */
  setAccessKeyResolver(resolver: AccessKeyResolver): void {
    this.resolver = resolver
  }

  /**
   * 获取指定 api 的 Access Key
   * 委托给已设置的 AccessKeyResolver；未设置解析器则返回 null
   */
  async resolveAccessKey(api: Api): Promise<string | null> {
    if (!this.resolver) return null
    return this.resolver.resolve(api)
  }
}

// 创建 Provider 注册表
export function createProviderRegistry(): ProviderRegistry {
  return new ProviderRegistry()
}

export interface DefaultProviderRegistryOptions {
  resolveOAuthKey?: CopilotCredentialResolver
  // Access Key 解析器
  // 可传入 EnvAccessKeyResolver / LocalFileAccessKeyResolver / ChainedAccessKeyResolver
  // 或任何实现 AccessKeyResolver 接口的自定义实现
  accessKeyResolver?: AccessKeyResolver
}

export function createDefaultProviderRegistry(
  options: DefaultProviderRegistryOptions = {},
): ProviderRegistry {
  const registry = createProviderRegistry()

  registry.register('github-copilot', () => createCopilotProvider({
    resolveOAuthKey: options.resolveOAuthKey,
  }))

  if (options.accessKeyResolver) {
    registry.setAccessKeyResolver(options.accessKeyResolver)
  }

  return registry
}

export {
  createEnvKeyResolver,
  createLocalFileKeyResolver,
  createChainedKeyResolver,
}
export type { AccessKeyResolver }

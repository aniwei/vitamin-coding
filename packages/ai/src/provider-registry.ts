// Provider 注册表 — 管理所有 LLM 提供商适配器
import { ProviderError } from '@vitamin/shared'

import type { Api } from './types'
import type { ProviderStream, ProviderFactory } from './types'

// Provider 注册表
export class ProviderRegistry {
  private readonly factories = new Map<Api, ProviderFactory>()
  private readonly instances = new Map<Api, ProviderStream>()

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
}

// 创建 Provider 注册表
export function createProviderRegistry(): ProviderRegistry {
  return new ProviderRegistry()
}

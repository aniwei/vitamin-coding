import { ProviderError } from '@x-mars/shared'
import { createCopilotProvider } from './provider/github-copilot'
import type { CopilotCredentialResolver } from './provider/github-copilot'
import { createAnthropicProvider } from './provider/anthropic'
import type { AnthropicCredentialResolver } from './provider/anthropic'

import { createDefaultAuthStore } from './auth-store'
import type { AuthStore } from './auth-store'

import { ModelRegistry, createDefaultModelRegistry } from './model-registry'
import type { Api, Provider, Model, ModelSpec } from './types'
import type { ProviderStream, ProviderFactory } from './types'

export interface ProviderRegistryOptions {
  authStore?: AuthStore
  modelRegistry?: ModelRegistry
}

export type DefaultProviderRegistryOptions = ProviderRegistryOptions

// Provider 注册表
export class ProviderRegistry {
  private readonly factories = new Map<Api, ProviderFactory>()
  private readonly instances = new Map<Api, ProviderStream>()

  private authStore: AuthStore
  private modelRegistry: ModelRegistry

  constructor({ authStore, modelRegistry }: ProviderRegistryOptions = {}) {
    this.authStore = authStore ?? createDefaultAuthStore()
    this.modelRegistry = modelRegistry ?? createDefaultModelRegistry()
  }

  register(api: Api, factory: ProviderFactory): void {
    this.factories.set(api, factory)

    if (this.instances.has(api)) {
      this.instances.delete(api)
    }
  }

  get(api: Api): ProviderStream {
    const cached = this.instances.get(api)
    if (cached) {
      return cached
    }

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

  has(api: Api): boolean {
    return this.factories.has(api)
  }

  list(): Api[] {
    return [...this.factories.keys()]
  }

  unregister(api: Api): void {
    this.factories.delete(api)
    this.instances.delete(api)
  }

  clear(): void {
    this.factories.clear()
    this.instances.clear()
  }

  setAuthStore(store: AuthStore): void {
    this.authStore = store
  }

  getAuthStore(): AuthStore {
    return this.authStore
  }

  async hasCredential(provider: Provider): Promise<boolean> {
    if (!this.authStore) {
      return false
    }
    return this.authStore.hasCredential(provider)
  }

  async resolveAccessKey(api: Api): Promise<string | null> {
    if (!this.authStore) {
      return null
    }
    return this.authStore.getCredentialKey(api)
  }

  async resolveBaseUrl(api: Api): Promise<string | null> {
    if (!this.authStore) {
      return null
    }
    return this.authStore.getBaseUrl(api)
  }

  async storeAccessKey(api: Api, key: string): Promise<void> {
    if (!this.authStore) {
      return
    }
    this.authStore.setCredentialKey(api, key)
    await this.authStore.save()
  }

  setModelRegistry(registry: ModelRegistry): void {
    this.modelRegistry = registry
  }

  getModelRegistry(): ModelRegistry {
    return this.modelRegistry
  }

  resolveModel(spec: ModelSpec): Model {
    if (this.modelRegistry) {
      return this.modelRegistry.resolve(spec)
    }

    if (typeof spec === 'object' && 'api' in spec && 'baseUrl' in spec) {
      return spec as Model
    }

    throw new ProviderError('No ModelRegistry configured; cannot resolve model spec', {
      code: 'PROVIDER_MODEL_NOT_FOUND',
    })
  }
}

// 创建空的 Provider 注册表
export function createProviderRegistry(options: ProviderRegistryOptions = {}): ProviderRegistry {
  return new ProviderRegistry(options)
}

export function createDefaultProviderRegistry(
  options: DefaultProviderRegistryOptions = {},
): ProviderRegistry {
  const registry = createProviderRegistry(options)

  registry.register('github-copilot', () => {
    const resolveOAuthAccessKey: CopilotCredentialResolver = () =>
      registry.resolveAccessKey('github-copilot').then((k) => k ?? undefined)
    return createCopilotProvider({ resolveOAuthAccessKey })
  })

  registry.register('anthropic-messages', () => {
    const resolveKey: AnthropicCredentialResolver = () =>
      registry.resolveAccessKey('anthropic').then((k) => k ?? undefined)
    const resolveBaseUrl = () => registry.resolveBaseUrl('anthropic').then((u) => u ?? undefined)
    return createAnthropicProvider({ resolveKey, resolveBaseUrl })
  })

  return registry
}

export type { AuthStore }

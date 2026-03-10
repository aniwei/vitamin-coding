// 模型注册表 — 管理所有已知模型定义
import { ProviderError } from '@vitamin/shared'
import type { Provider, Model } from './types'

// 模型注册表
export class ModelRegistry {
  private readonly models = new Map<string, Model>()

  constructor(models: Model[] = []  ) {
    for (const model of models) {
      this.register(model)
    }
  }

  // 注册自定义模型
  register(model: Model): void {
    this.models.set(model.id, model)
  }

  // 根据 ID 获取模型
  get(id: string): Model {
    const model = this.models.get(id)
    if (!model) {
      throw new ProviderError(`Model not found: ${id}`, {
        code: 'PROVIDER_MODEL_NOT_FOUND',
      })
    }
    return model
  }

  // 尝试获取模型（不存在返回 undefined）
  find(id: string): Model | undefined {
    return this.models.get(id)
  }

  // 获取所有已注册模型
  getAll(): Model[] {
    return [...this.models.values()]
  }

  // 按提供商过滤
  getByProvider(provider: Provider): Model[] {
    return this.getAll().filter((m) => m.provider === provider)
  }

  // 检查模型是否存在
  has(id: string): boolean {
    return this.models.has(id)
  }

  // 移除模型
  unregister(id: string): void {
    this.models.delete(id)
  }

  // 已注册模型数量
  get size(): number {
    return this.models.size
  }
}

// 创建模型注册表
export function createModelRegistry(): ModelRegistry {
  return new ModelRegistry()
}

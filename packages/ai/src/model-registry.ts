import { ProviderError } from '@vitamin/shared'
import type { Provider, Model, ModelSpec, Api } from './types'

// 将 ModelSpec 规范化为字符串 id
function specToId(spec: ModelSpec): string {
  if (typeof spec === 'string') return spec
  if ('id' in spec && typeof spec.id === 'string') return spec.id
  return `${spec.provider}/${spec.name}`
}

// 模型注册表
export class ModelRegistry {
  private readonly models = new Map<string, Model>()
  private defaultModel: Model | undefined

  constructor(models: Model[] = []) {
    for (const model of models) {
      this.register(model)
    }
  }

  // 注册自定义模型
  register(model: Model): void {
    this.models.set(model.id, model)
  }

  // 批量注册
  registerMany(models: Model[]): void {
    for (const model of models) {
      this.register(model)
    }
  }

  // 设置默认模型（resolve 的 fallback 模板）
  setDefault(model: Model): void {
    this.defaultModel = model
    // 同时注册到表中
    if (!this.models.has(model.id)) {
      this.register(model)
    }
  }

  // 获取默认模型
  getDefault(): Model | undefined {
    return this.defaultModel
  }

  // 解析 ModelSpec 为完整 Model
  // 优先级：注册表精确匹配 → 默认模型模板覆盖 → 抛错
  resolve(spec: ModelSpec): Model {
    // 完整 Model 对象直接返回
    if (typeof spec === 'object' && 'api' in spec && 'baseUrl' in spec) {
      return spec as Model
    }

    const id = specToId(spec)

    // 注册表精确命中
    const registered = this.models.get(id)
    if (registered) return registered

    // 有默认模型模板时，用 spec 信息覆盖模板
    if (this.defaultModel) {
      if (typeof spec === 'string') {
        const slashIdx = spec.indexOf('/')
        if (slashIdx > 0) {
          const provider = spec.slice(0, slashIdx)
          const name = spec.slice(slashIdx + 1)
          return { ...this.defaultModel, id: spec, provider, name }
        }
        return { ...this.defaultModel, id: spec, name: spec }
      }
      // { provider, name, api? } 对象
      return {
        ...this.defaultModel,
        id,
        provider: spec.provider,
        name: spec.name,
        api: (spec.api ?? this.defaultModel.api) as Api,
      }
    }

    throw new ProviderError(`Model not found: ${id}`, {
      code: 'PROVIDER_MODEL_NOT_FOUND',
    })
  }

  // 尝试解析（不抛错）
  tryResolve(spec: ModelSpec): Model | undefined {
    try {
      return this.resolve(spec)
    } catch {
      return undefined
    }
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
export function createModelRegistry(models?: Model[]): ModelRegistry {
  return new ModelRegistry(models)
}

// ═══ 默认模型集 ═══

const COPILOT_BASE = 'https://api.githubcopilot.com'

// GitHub Copilot 可用模型（通过 Copilot API 代理的主流模型）
const COPILOT_MODELS: Model[] = [
  // ── GPT 系列 ──
  {
    id: 'github-copilot/gpt-4.1',
    name: 'gpt-4.1',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: COPILOT_BASE,
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 3, output: 12, cacheRead: 1.5, cacheWrite: 3 },
    contextWindow: 1048576,
    maxOutputTokens: 32768,
  },
  {
    id: 'github-copilot/gpt-4.1-mini',
    name: 'gpt-4.1-mini',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: COPILOT_BASE,
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0.4, output: 1.6, cacheRead: 0.1, cacheWrite: 0.4 },
    contextWindow: 1048576,
    maxOutputTokens: 32768,
  },
  {
    id: 'github-copilot/gpt-4o',
    name: 'gpt-4o',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: COPILOT_BASE,
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 2.5 },
    contextWindow: 128000,
    maxOutputTokens: 16384,
  },
  {
    id: 'github-copilot/o3-mini',
    name: 'o3-mini',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: COPILOT_BASE,
    reasoning: true,
    input: ['text'],
    cost: { input: 1.1, output: 4.4, cacheRead: 0.55, cacheWrite: 1.1 },
    contextWindow: 200000,
    maxOutputTokens: 100000,
    thinkingLevels: ['low', 'medium', 'high'],
  },
  {
    id: 'github-copilot/o4-mini',
    name: 'o4-mini',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: COPILOT_BASE,
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 1.1, output: 4.4, cacheRead: 0.275, cacheWrite: 1.1 },
    contextWindow: 200000,
    maxOutputTokens: 100000,
    thinkingLevels: ['low', 'medium', 'high'],
  },
  // ── Claude 系列 ──
  {
    id: 'github-copilot/claude-sonnet-4-20250514',
    name: 'claude-sonnet-4-20250514',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: COPILOT_BASE,
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    contextWindow: 200000,
    maxOutputTokens: 16000,
    thinkingLevels: ['low', 'medium', 'high'],
  },
  {
    id: 'github-copilot/claude-3.5-sonnet',
    name: 'claude-3.5-sonnet',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: COPILOT_BASE,
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    contextWindow: 200000,
    maxOutputTokens: 8192,
  },
  // ── Gemini 系列 ──
  {
    id: 'github-copilot/gemini-2.0-flash',
    name: 'gemini-2.0-flash',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: COPILOT_BASE,
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0.1 },
    contextWindow: 1048576,
    maxOutputTokens: 8192,
  },
  {
    id: 'github-copilot/gemini-2.5-pro',
    name: 'gemini-2.5-pro',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: COPILOT_BASE,
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 1.25, output: 10, cacheRead: 0.3125, cacheWrite: 1.25 },
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    thinkingLevels: ['low', 'medium', 'high'],
  },
]

// 创建带默认模型集的注册表
export function createDefaultModelRegistry(extraModels?: Model[]): ModelRegistry {
  const registry = new ModelRegistry(COPILOT_MODELS)
  if (extraModels) {
    registry.registerMany(extraModels)
  }
  return registry
}

// Category→Model 三级 fallback 解析
import { ProviderError } from '@vitamin/shared'

import type { Model } from './types'

// Category 定义
export interface Category {
  name: string
  description: string
  // 优先模型（按优先级排序）
  preferredModels: string[]
  // 特征要求
  requirements?: {
    reasoning?: boolean
    multimodal?: boolean
    minContextWindow?: number
    maxCostPerMillion?: number
  }
}

// 8 个内置 Category
export const BUILTIN_CATEGORIES: Record<string, Category> = {
  general: {
    name: 'general',
    description: '通用任务',
    preferredModels: ['anthropic/claude-opus-4-6', 'openai/gpt-5.3-codex'],
  },
  quick: {
    name: 'quick',
    description: '小型快速任务、翻译、简单编辑',
    preferredModels: ['anthropic/claude-haiku-4-5', 'openai/gpt-4.1-mini'],
  },
  deep: {
    name: 'deep',
    description: '深度逻辑推理和自主问题解决',
    preferredModels: ['openai/gpt-5.3-codex', 'anthropic/claude-opus-4-6'],
  },
  ui: {
    name: 'ui',
    description: '前端 UI/UX、视觉更改、CSS',
    preferredModels: ['google/gemini-3.1-pro', 'anthropic/claude-sonnet-4-6'],
  },
  search: {
    name: 'search',
    description: '网络搜索、低成本检索',
    preferredModels: ['xai/grok-code-fast', 'deepseek/deepseek-chat'],
  },
  writing: {
    name: 'writing',
    description: '文档、写作任务',
    preferredModels: ['moonshot/kimi-k2.5', 'anthropic/claude-sonnet-4-6'],
  },
  planning: {
    name: 'planning',
    description: '架构、复杂规划',
    preferredModels: ['anthropic/claude-opus-4-6', 'openai/o3'],
  },
  review: {
    name: 'review',
    description: '代码审查、质量分析',
    preferredModels: ['openai/gpt-5.2', 'anthropic/claude-opus-4-6'],
  },
}

// 系统级 fallback 链（最后兜底）
export const SYSTEM_FALLBACK_CHAIN = [
  'anthropic/claude-sonnet-4-6',
  'openai/gpt-4.1-mini',
  'google/gemini-3.1-flash',
  'github-copilot/gpt-4.1',
  'ollama/llama3.3',
]

// 解析器配置
export interface ResolverConfig {
  // 用户配置的 Category→Model 覆盖
  categories?: Record<string, { model?: string }>
}

// 三级 fallback 模型解析
export function resolveModel(
  category: string,
  config: ResolverConfig,
  availableModels: Model[],
): Model {
  // 等级 1: 用户配置覆盖
  const userOverride = config.categories?.[category]?.model
  if (userOverride) {
    const model = findModel(userOverride, availableModels)
    if (model) return model
  }

  // 等级 2: Category 默认 preferredModels
  const builtinCategory = BUILTIN_CATEGORIES[category]
  if (builtinCategory) {
    for (const modelId of builtinCategory.preferredModels) {
      const model = findModel(modelId, availableModels)
      if (model) return model
    }
  }

  // 等级 3: 系统 fallback 链
  for (const modelId of SYSTEM_FALLBACK_CHAIN) {
    const model = findModel(modelId, availableModels)
    if (model) return model
  }

  throw new ProviderError(`No available model for category: ${category}`, {
    code: 'PROVIDER_NO_MODEL',
  })
}

// 从可用模型列表中查找模型
function findModel(id: string, available: Model[]): Model | undefined {
  return available.find((m) => m.id === id)
}

// 检查模型是否满足 Category 需求
export function modelMeetsRequirements(model: Model, category: Category): boolean {
  const req = category.requirements
  if (!req) return true

  if (req.reasoning && !model.reasoning) return false
  if (req.multimodal && !model.input.includes('image')) return false
  if (req.minContextWindow && model.contextWindow < req.minContextWindow) return false
  if (req.maxCostPerMillion && model.cost.input > req.maxCostPerMillion) return false

  return true
}

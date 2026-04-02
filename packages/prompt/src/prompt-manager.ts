import { PromptCache } from './prompt-cache'
import type { AssembleOptions, PromptProvider } from './types'

/** lead-guidance 各 section 与 prompt key 的映射 */
const LEAD_SECTIONS: Record<keyof AssembleOptions, string> = {
  workflowOverview: 'lead-guidance/workflow-overview',
  phaseDiscipline: 'lead-guidance/phase-discipline',
  complexityRouting: 'lead-guidance/complexity-routing',
  reviewGuidance: 'lead-guidance/review-guidance',
  modelSlotGuidance: 'lead-guidance/model-slot-guidance',
  fileStateGuidance: 'lead-guidance/file-state-guidance',
}

/** 组装时的默认顺序 */
const ASSEMBLE_ORDER: (keyof AssembleOptions)[] = [
  'workflowOverview',
  'phaseDiscipline',
  'complexityRouting',
  'reviewGuidance',
  'modelSlotGuidance',
  'fileStateGuidance',
]

export interface PromptManagerOptions {
  provider: PromptProvider
}

export class PromptManager {
  private readonly provider: PromptProvider
  private readonly cache: PromptCache

  constructor(options: PromptManagerOptions) {
    this.cache = new PromptCache()
    this.provider = options.provider
  }

  async load(key: string): Promise<string | null> {
    const entry = await this.provider.load(key)
    if (!entry) return null
    this.cache.set(entry.key, entry.content, entry.version)
    return entry.content
  }

  async list(): Promise<string[]> {
    return this.provider.list()
  }

  async assemble(sections?: AssembleOptions): Promise<string> {
    const config: AssembleOptions = {
      phaseDiscipline: true,
      complexityRouting: true,
      reviewGuidance: true,
      workflowOverview: true,
      fileStateGuidance: true,
      modelSlotGuidance: true,
      ...sections,
    }

    const keysToLoad: string[] = []
    for (const section of ASSEMBLE_ORDER) {
      if (config[section]) {
        const key = LEAD_SECTIONS[section]
        if (!this.cache.has(key)) {
          keysToLoad.push(key)
        }
      }
    }

    // 批量加载未缓存的 sections
    if (keysToLoad.length > 0) {
      const entries = await this.provider.loadMany(keysToLoad)
      for (const [key, entry] of entries) {
        this.cache.set(key, entry.content, entry.version)
      }
    }

    // 按顺序组装
    const parts: string[] = []
    for (const section of ASSEMBLE_ORDER) {
      if (config[section]) {
        const content = this.cache.get(LEAD_SECTIONS[section])
        if (content) {
          parts.push(content)
        }
      }
    }

    return parts.join('\n\n')
  }

  /**
   * 加载指定 key 的 prompt 用于 session-end learning
   */
  async loadSessionEndLearningPrompt(): Promise<string | null> {
    return this.load('lesson/session-end-learning')
  }

  /**
   * 使缓存失效（下次 assemble 重新加载）
   */
  invalidate(): void {
    this.cache.clear()
  }

  /**
   * 获取内部缓存实例（供需要精细控制的场景使用）
   */
  getCache(): PromptCache {
    return this.cache
  }
}

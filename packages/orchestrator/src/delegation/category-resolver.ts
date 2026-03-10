// Category → Agent 映射解析器 (§S7.1 路径 B)
import { createLogger } from '@vitamin/shared'

const log = createLogger('orchestrator:category-resolver')

// 内置 Category → Agent 映射表
const DEFAULT_CATEGORY_MAP: Record<string, string> = {
  code: 'hephaestus',
  architecture: 'oracle',
  search: 'explore',
  knowledge: 'librarian',
  quick: 'sisyphus-junior',
  debug: 'hephaestus',
  test: 'hephaestus',
  general: 'central-secretariat',
}

export interface CategoryResolverOptions {
  overrides?: Record<string, string>
}

export class CategoryResolver {
  private readonly categoryMap: Map<string, string>

  constructor(options: CategoryResolverOptions = {}) {
    this.categoryMap = new Map(Object.entries(DEFAULT_CATEGORY_MAP))
    if (options.overrides) {
      for (const [category, agent] of Object.entries(options.overrides)) {
        this.categoryMap.set(category, agent)
      }
    }
  }

  // 解析 Category → Agent 名称
  resolve(category: string): string | undefined {
    const agent = this.categoryMap.get(category)
    if (agent) {
      log.debug(`Category "${category}" resolved to agent "${agent}"`)
    } else {
      log.warn(`No agent mapping for category "${category}"`)
    }
    return agent
  }

  // 获取所有 Category 列表
  getCategories(): string[] {
    return [...this.categoryMap.keys()]
  }

  // 获取完整映射表
  getMapping(): ReadonlyMap<string, string> {
    return this.categoryMap
  }

  // 动态添加/覆盖映射
  setMapping(category: string, agentName: string): void {
    this.categoryMap.set(category, agentName)
  }
}

export function createCategoryResolver(options?: CategoryResolverOptions): CategoryResolver {
  return new CategoryResolver(options)
}

// 工具注册表 — 注册、查询、预设过滤
import type { AgentTool } from '@vitamin/agent'
import type { RegisteredTool, ToolMetadata, ToolPreset, ToolRegistrationOptions } from './types'

// 预设包含关系: minimal ⊂ standard ⊂ full
const PRESET_INCLUDES: Record<ToolPreset, Set<ToolPreset>> = {
  minimal: new Set(['minimal']),
  standard: new Set(['minimal', 'standard']),
  full: new Set(['minimal', 'standard', 'full']),
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>()

  // 注册工具
  register<TArgs = unknown>(tool: AgentTool<TArgs>, options: ToolRegistrationOptions = {}): void {
    const metadata: ToolMetadata = {
      preset: options.preset ?? 'full',
      category: options.category,
      builtin: options.builtin ?? false,
    }

    const registered: RegisteredTool<TArgs> = {
      ...tool,
      metadata,
    }

    this.tools.set(tool.name, registered as RegisteredTool)
  }

  // 注销工具
  unregister(name: string): boolean {
    return this.tools.delete(name)
  }

  // 按名称获取工具
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name)
  }

  // 检查工具是否存在
  has(name: string): boolean {
    return this.tools.has(name)
  }

  // 获取所有注册的工具
  getAll(): RegisteredTool[] {
    return [...this.tools.values()]
  }

  // 按预设获取可用工具
  getAvailable(preset: ToolPreset = 'standard'): RegisteredTool[] {
    const includes = PRESET_INCLUDES[preset]
    return this.getAll().filter((tool) => includes.has(tool.metadata.preset))
  }

  // 按分类获取工具
  getByCategory(category: string): RegisteredTool[] {
    return this.getAll().filter((tool) => tool.metadata.category === category)
  }

  // 获取内置工具
  getBuiltin(): RegisteredTool[] {
    return this.getAll().filter((tool) => tool.metadata.builtin)
  }

  // 按名称列表过滤工具（白名单）
  filterByNames(names: string[]): RegisteredTool[] {
    const nameSet = new Set(names)
    return this.getAll().filter((tool) => nameSet.has(tool.name))
  }

  // 排除指定名称的工具（黑名单）
  excludeByNames(names: string[]): RegisteredTool[] {
    const nameSet = new Set(names)
    return this.getAll().filter((tool) => !nameSet.has(tool.name))
  }

  // 工具数量
  get size(): number {
    return this.tools.size
  }

  // 清空所有工具
  clear(): void {
    this.tools.clear()
  }
}

// 工厂函数
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry()
}

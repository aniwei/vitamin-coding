// 工具注册表 — 注册、查询、预设过滤
import { createBinaryToolExecutorRegistry, type BinaryToolExecutorRegistry } from './binary/binary-executor-registry'
import { registerBuiltinTools, type RegisterBuiltinOptions } from './register-builtin'
import type { AgentTool } from '@vitamin/agent'
import type { 
  RegisteredTool, 
  ToolMetadata, 
  ToolPreset, 
  ToolRegistrationOptions 
} from './types'



// 预设包含关系 minimal ⊂ standard ⊂ full
const PRESET_INCLUDES: Record<ToolPreset, Set<ToolPreset>> = {
  minimal: new Set(['minimal']),
  standard: new Set(['minimal', 'standard']),
  full: new Set(['minimal', 'standard', 'full']),
}

type AgentToolTuple<T extends readonly unknown[]> = T & {
  [K in keyof T]: T[K] extends AgentTool<infer _Args> ? T[K] : never
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>()
  private binaryToolExecutors: BinaryToolExecutorRegistry | null = null

  // 工具数量
  get size(): number {
    return this.tools.size
  }

  setBinaryToolExecutors(registry: BinaryToolExecutorRegistry): void {
    this.binaryToolExecutors = registry
  }

  getBinaryToolExecutors(): BinaryToolExecutorRegistry {
    if (!this.binaryToolExecutors) {
      throw new Error('BinaryToolExecutorRegistry is not set in ToolRegistry')
    }
    return this.binaryToolExecutors
  }

  // 注册工具
  register<Args = unknown>(tool: AgentTool<Args>, options?: ToolRegistrationOptions): void;
  register<Tools extends readonly unknown[]>(tools: AgentToolTuple<Tools>, options?: ToolRegistrationOptions): void;
  register(
    tools: AgentTool<unknown> | readonly unknown[],
    options: ToolRegistrationOptions = {},
  ): void {
    const metadata: ToolMetadata = {
      preset: options.preset ?? 'full',
      category: options.category,
      builtin: options.builtin ?? false,
    }

    const toolList = Array.isArray(tools) ? tools : [tools]
    for (const tool of toolList) {
      const typedTool = tool as AgentTool
      const registered: RegisteredTool = { ...typedTool, metadata }
      this.tools.set(typedTool.name, registered)
    }
  }

  // 注销工具
  unregister(name: string): boolean;
  unregister(name: string | string[]): boolean {
    if (Array.isArray(name)) {
      let allDeleted = true
      for (const n of name) {
        const deleted = this.tools.delete(n)
        if (!deleted) {
          allDeleted = false
        }
      }

      return allDeleted
    } 

    return this.tools.delete(name)
  }
  
  // 按名称列表获取工具
  getByNames(names: string[]): RegisteredTool[] {
    const set = new Set(names)
    return this.getAll().filter((tool) => set.has(tool.name))
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

  // 清空所有工具
  clear(): void {
    this.tools.clear()
  }
}

export const createToolRegistry = (
  projectRoot: string,
  options: RegisterBuiltinOptions
): ToolRegistry => {
  const registry = new ToolRegistry()
  
  const binaryRegistry = createBinaryToolExecutorRegistry(projectRoot)
  registry.setBinaryToolExecutors(binaryRegistry)
  
  registerBuiltinTools(
    registry, 
    projectRoot, 
    options
  )

  return registry
}

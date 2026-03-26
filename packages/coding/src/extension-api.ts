import type { AgentTool } from '@vitamin/agent'
import type { HookTiming, HookRegistration, HookRegistry } from '@vitamin/hooks'
import type { PromptTemplate } from './resource-loader'

// 扩展描述 
export interface ExtensionDescriptor {
  // 扩展名称
  name: string
  // 版本
  version?: string
  // 描述
  description?: string
}

// 扩展入口函数签名 
export type ExtensionActivate = (api: ExtensionAPI) => void | Promise<void>

// 扩展模块必须满足的接口
export interface ExtensionModule {
  activate: ExtensionActivate
  descriptor?: ExtensionDescriptor
}

// 已激活的扩展记录
export interface LoadedExtension {
  descriptor: ExtensionDescriptor
  tools: AgentTool[]
  hooks: HookRegistration[]
  prompts: PromptTemplate[]
}


export interface ExtensionAPI {
  // 注册工具
  registerTool(tool: AgentTool): void
  // 批量注册工具
  registerTools(tools: AgentTool[]): void
  // 注册 Hook
  registerHook<T extends HookTiming>(registration: HookRegistration<T>): void
  // 注册 prompt 模板
  registerPrompt(template: PromptTemplate): void
  // 获取当前扩展的描述
  readonly descriptor: ExtensionDescriptor
}


class ExtensionContext implements ExtensionAPI {
  readonly descriptor: ExtensionDescriptor
  readonly tools: AgentTool[] = []
  readonly hooks: HookRegistration[] = []
  readonly prompts: PromptTemplate[] = []

  private hookRegistry: HookRegistry

  constructor(descriptor: ExtensionDescriptor, hookRegistry: HookRegistry) {
    this.descriptor = descriptor
    this.hookRegistry = hookRegistry
  }

  registerTool(tool: AgentTool): void {
    this.tools.push(tool)
  }

  registerTools(tools: AgentTool[]): void {
    for (const tool of tools) {
      this.registerTool(tool)
    }
  }

  registerHook<T extends HookTiming>(registration: HookRegistration<T>): void {
    this.hooks.push(registration as unknown as HookRegistration)
    // 立即注册到全局 HookRegistry
    this.hookRegistry.register(registration)
  }

  registerPrompt(template: PromptTemplate): void {
    this.prompts.push(template)
  }

  toLoaded(): LoadedExtension {
    return {
      descriptor: this.descriptor,
      tools: this.tools,
      hooks: this.hooks,
      prompts: this.prompts,
    }
  }
}

export class ExtensionManager {
  private loaded = new Map<string, LoadedExtension>()
  private hookRegistry: HookRegistry

  constructor(hookRegistry: HookRegistry) {
    this.hookRegistry = hookRegistry
  }

  // 激活一个扩展模块
  async activate(module: ExtensionModule): Promise<LoadedExtension> {
    const descriptor = module.descriptor ?? { name: 'unknown' }
    const ctx = new ExtensionContext(descriptor, this.hookRegistry)

    await module.activate(ctx)

    const loaded = ctx.toLoaded()
    this.loaded.set(descriptor.name, loaded)

    await this.hookRegistry.emit('extension.loaded', {
      extensionName: descriptor.name,
    })

    return loaded
  }

  // 获取已加载的扩展 
  get(name: string): LoadedExtension | undefined {
    return this.loaded.get(name)
  }

  // 列出所有已加载扩展
  list(): LoadedExtension[] {
    return [...this.loaded.values()]
  }

  // 获取所有扩展注册的工具 
  getAllTools(): AgentTool[] {
    const tools: AgentTool[] = []
    for (const ext of this.loaded.values()) {
      tools.push(...ext.tools)
    }
    return tools
  }

  // 获取所有扩展注册的 prompt 模板 
  getAllPrompts(): PromptTemplate[] {
    const prompts: PromptTemplate[] = []
    for (const ext of this.loaded.values()) {
      prompts.push(...ext.prompts)
    }
    return prompts
  }

  dispose(): void {
    this.loaded.clear()
  }
}

// 创建 ExtensionManager 
export function createExtensionManager(hookRegistry: HookRegistry): ExtensionManager {
  return new ExtensionManager(hookRegistry)
}

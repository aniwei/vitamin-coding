import {
  createBinaryToolExecutorRegistry,
  type BinaryToolExecutorRegistry,
} from './binary/binary-executor-registry'
import { registerBuiltinTools, type RegisterBuiltinOptions } from './register-builtin'
import type { AgentTool } from '@vitamin/agent'
import type { RegisteredTool, ToolMetadata, ToolPreset, ToolRegistrationOptions } from './types'

const PRESET_INCLUDES: Record<ToolPreset, Set<ToolPreset>> = {
  minimal: new Set(['minimal']),
  standard: new Set(['minimal', 'standard']),
  full: new Set(['minimal', 'standard', 'full']),
}

function isAgentTool(value: unknown): value is AgentTool<unknown> {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<AgentTool<unknown>>
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.execute === 'function' &&
    candidate.parameters !== undefined
  )
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>()
  private binaryToolExecutors: BinaryToolExecutorRegistry | null = null
  private version = 0

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

  register(tool: unknown, options?: ToolRegistrationOptions): void
  register(tools: unknown[], options?: ToolRegistrationOptions): void
  register(tools: unknown | unknown[], options: ToolRegistrationOptions = {}): void {
    const metadata: ToolMetadata = {
      preset: options.preset ?? 'full',
      category: options.category,
      builtin: options.builtin ?? false,
      snippet: options.snippet,
      guideline: options.guideline,
    }

    const toolList = Array.isArray(tools) ? tools : [tools]
    for (const tool of toolList) {
      if (!isAgentTool(tool)) {
        throw new Error('Invalid tool registration input')
      }

      const typedTool = tool
      const registered: RegisteredTool = { ...typedTool, metadata }
      this.tools.set(typedTool.name, registered)
    }

    this.version++
  }

  unregister(name: string): boolean
  unregister(name: string[]): boolean
  unregister(name: string | string[]): boolean {
    if (Array.isArray(name)) {
      let allDeleted = true
      for (const n of name) {
        const deleted = this.tools.delete(n)
        if (!deleted) {
          allDeleted = false
        }
      }

      if (allDeleted) this.version++
      return allDeleted
    }

    const deleted = this.tools.delete(name)
    if (deleted) this.version++
    return deleted
  }

  getByNames(names: string[]): RegisteredTool[] {
    const set = new Set(names)
    return this.getAll().filter((tool) => set.has(tool.name))
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  getAll(): RegisteredTool[] {
    return [...this.tools.values()]
  }

  getAvailable(preset: ToolPreset = 'standard'): RegisteredTool[] {
    const includes = PRESET_INCLUDES[preset]
    return this.getAll().filter((tool) => includes.has(tool.metadata.preset))
  }

  getByCategory(category: string): RegisteredTool[] {
    return this.getAll().filter((tool) => tool.metadata.category === category)
  }

  getBuiltin(): RegisteredTool[] {
    return this.getAll().filter((tool) => tool.metadata.builtin)
  }

  filterByNames(names: string[]): RegisteredTool[] {
    const nameSet = new Set(names)
    return this.getAll().filter((tool) => nameSet.has(tool.name))
  }

  excludeByNames(names: string[]): RegisteredTool[] {
    const nameSet = new Set(names)
    return this.getAll().filter((tool) => !nameSet.has(tool.name))
  }

  buildToolGuidance(preset: ToolPreset = 'standard'): string {
    const tools = this.getAvailable(preset)
    const parts: string[] = []

    for (const tool of tools) {
      const { snippet, guideline } = tool.metadata
      const lines: string[] = [`#### ${tool.name}`]

      if (guideline) {
        lines.push(guideline)
      } else if (!snippet) {
        // fallback: ensure every tool has at least a description line
        lines.push(tool.description)
      }

      if (snippet) lines.push(`Example:\n\`\`\`\n${snippet}\n\`\`\``)
      parts.push(lines.join('\n'))
    }

    if (parts.length === 0) return ''
    return `### Tool Usage Guidelines\n\n${parts.join('\n\n')}`
  }

  clear(): void {
    if (this.tools.size > 0) {
      this.tools.clear()
      this.version++
    }
  }

  dispose(): void {
    this.clear()
    if (this.binaryToolExecutors) {
      this.binaryToolExecutors.dispose()
      this.binaryToolExecutors = null
    }
  }
}

export const createToolRegistry = (
  workspaceDir: string,
  options: RegisterBuiltinOptions,
): ToolRegistry => {
  const registry = new ToolRegistry()

  const binaryRegistry = createBinaryToolExecutorRegistry(workspaceDir)
  registry.setBinaryToolExecutors(binaryRegistry)

  registerBuiltinTools(registry, workspaceDir, options)

  return registry
}

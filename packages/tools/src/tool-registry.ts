import {
  createBinaryToolExecutorRegistry,
  type BinaryToolExecutorRegistry,
} from './binary/binary-executor-registry'
import { registerBuiltinTools, type RegisterBuiltinOptions } from './register-builtin'
import type { AgentTool } from '@vitamin/agent'
import type { ToolPreset } from '@vitamin/setting'
import type {
  RegisteredTool,
  ToolMetadata,
  ToolMetadataCoverage,
  ToolMetadataCoverageIssue,
  ToolRegistrationOptions,
} from './types'

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
    const toolList = Array.isArray(tools) ? tools : [tools]
    for (const tool of toolList) {
      if (!isAgentTool(tool)) {
        throw new Error('Invalid tool registration input')
      }

      const typedTool = tool
      const shouldDefer = options.shouldDefer ?? typedTool.shouldDefer ?? false
      const metadata: ToolMetadata = {
        preset: options.preset ?? 'full',
        category: options.category,
        builtin: options.builtin ?? false,
        pluginId: options.pluginId,
        snippet: options.snippet,
        guideline: options.guideline,
        shouldDefer,
      }
      const registered: RegisteredTool = {
        ...typedTool,
        shouldDefer,
        metadata,
      }
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

      if (allDeleted) {
        this.version++
      }
      return allDeleted
    }

    const deleted = this.tools.delete(name)
    if (deleted) {
      this.version++
    }
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
    const includes = PRESET_INCLUDES[preset] ?? PRESET_INCLUDES.standard
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
        // 回退：确保每个工具至少有一行描述
        lines.push(tool.description)
      }

      if (snippet) {
        lines.push(`Example:\n\`\`\`\n${snippet}\n\`\`\``)
      }
      parts.push(lines.join('\n'))
    }

    if (parts.length === 0) {
      return ''
    }
    return `### Tool Usage Guidelines\n\n${parts.join('\n\n')}`
  }

  buildToolAvailability(preset: ToolPreset = 'standard'): string {
    const tools = this.getAvailable(preset)
    if (tools.length === 0) {
      return ''
    }

    const active = tools.filter((tool) => !tool.shouldDefer)
    const deferred = tools.filter((tool) => tool.shouldDefer)
    const categories = new Map<string, string[]>()

    for (const tool of tools) {
      const category = tool.metadata.category ?? 'uncategorized'
      const names = categories.get(category) ?? []
      names.push(tool.name)
      categories.set(category, names)
    }

    const lines = [
      '### Tool Availability',
      '',
      `Active tool schemas: ${active.length > 0 ? active.map((tool) => tool.name).join(', ') : 'none'}`,
      `Deferred tools: ${deferred.length > 0 ? deferred.map((tool) => tool.name).join(', ') : 'none'}`,
      '',
      'Categories:',
    ]

    for (const [category, names] of [...categories.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      lines.push(`- ${category}: ${names.sort().join(', ')}`)
    }

    return lines.join('\n')
  }

  buildDeferredToolsGuidance(preset: ToolPreset = 'standard'): string {
    const deferred = this.getAvailable(preset).filter((tool) => tool.shouldDefer)
    if (deferred.length === 0) {
      return ''
    }

    const lines = [
      '### Deferred Tools',
      '',
      'Some tools are available on request only. Use `tool_search` to load their full schemas before calling them.',
      'Use `select:<tool_name>` for direct selection or search by keyword.',
      '',
      ...deferred
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(
          (tool) =>
            `- ${tool.name} [${tool.metadata.category ?? 'uncategorized'}]: ${tool.description}`,
        ),
    ]

    return lines.join('\n')
  }

  getMetadataCoverage(preset: ToolPreset = 'full'): ToolMetadataCoverage {
    const tools = this.getAvailable(preset).filter((tool) => tool.metadata.builtin)
    const issues: ToolMetadataCoverageIssue[] = []

    for (const tool of tools) {
      const missing: ToolMetadataCoverageIssue['missing'] = []
      if (!tool.metadata.preset) {
        missing.push('preset')
      }
      if (!tool.metadata.category) {
        missing.push('category')
      }
      if (!tool.metadata.guideline && !tool.metadata.snippet && !tool.description) {
        missing.push('guidance')
      }
      if (typeof tool.metadata.shouldDefer !== 'boolean') {
        missing.push('shouldDefer')
      }
      if (missing.length > 0) {
        issues.push({ toolName: tool.name, missing })
      }
    }

    const covered = tools.length - issues.length
    return {
      total: tools.length,
      covered,
      percent: tools.length === 0 ? 100 : Math.round((covered / tools.length) * 100),
      issues,
    }
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

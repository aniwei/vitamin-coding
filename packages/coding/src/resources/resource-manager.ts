import {
  PersistentMemory,
  FileSystemMemoryStore,
  DEFAULT_MEMORY_SOURCES,
} from '@vitamin/memory'
import { VITAMIN_HOME } from '@vitamin/env'

import type { MemorySource, MemoryStore } from '@vitamin/memory'

export interface PromptTemplate {
  name: string
  content: string
  filePath: string
  source: 'user' | 'project'
}

export interface LoadedResources {
  memories: ReadonlyMap<string, string>
  agentInstructions: string
  promptTemplates: PromptTemplate[]
  diagnostics: ResourceDiagnostic[]
}

export interface ResourceDiagnostic {
  type: 'warning' | 'collision' | 'error'
  category: 'memory' | 'prompt'
  name: string
  filePath: string
  message: string
}

export interface ResourceManagerOptions {
  workspaceDir?: string
  memorySources?: MemorySource[]
  memoryStore?: MemoryStore
  promptDirs?: string[]
  watch?: boolean
}

export interface ResourceManager {
  load(): Promise<LoadedResources>
  reload(): Promise<LoadedResources>
  setPromptDirs(promptDirs: string[]): void
  readonly resources: LoadedResources | null
  onChange(callback: (resources: LoadedResources) => void): () => void
  dispose(): void
}

export class DefaultResourceManager implements ResourceManager {
  private readonly persistentMemory: PersistentMemory
  private readonly options: ResourceManagerOptions
  private dynamicPromptDirs: string[]
  private loadedResources: LoadedResources | null = null
  private readonly changeCallbacks = new Set<(resources: LoadedResources) => void>()

  constructor(options: ResourceManagerOptions = {}) {
    this.options = options
    this.dynamicPromptDirs = [...(options.promptDirs ?? [])]

    const workspaceDir = options.workspaceDir ?? process.cwd()
    const memoryStore = options.memoryStore ?? new FileSystemMemoryStore(workspaceDir)
    const memorySources = options.memorySources ?? DEFAULT_MEMORY_SOURCES

    this.persistentMemory = new PersistentMemory(memoryStore, memorySources)
  }

  get resources(): LoadedResources | null {
    return this.loadedResources
  }

  setPromptDirs(promptDirs: string[]): void {
    this.dynamicPromptDirs = [...promptDirs]
  }

  async load(): Promise<LoadedResources> {
    const workspaceDir = this.options.workspaceDir ?? process.cwd()

    const [memoryResult, promptsResult] = await Promise.all([
      this.loadMemory(),
      this.loadPromptTemplates(workspaceDir),
    ])

    const loaded: LoadedResources = {
      agentInstructions: memoryResult.injection,
      memories: memoryResult.memories,
      promptTemplates: promptsResult.templates,
      diagnostics: promptsResult.diagnostics,
    }

    this.loadedResources = loaded

    if (this.options.watch) {
      this.persistentMemory.startWatching()
    }

    for (const callback of this.changeCallbacks) {
      callback(loaded)
    }

    return loaded
  }

  async reload(): Promise<LoadedResources> {
    return this.load()
  }

  onChange(callback: (resources: LoadedResources) => void): () => void {
    this.changeCallbacks.add(callback)
    return () => {
      this.changeCallbacks.delete(callback)
    }
  }

  dispose(): void {
    this.persistentMemory.dispose()
    this.changeCallbacks.clear()
    this.loadedResources = null
  }

  private async loadMemory(): Promise<{
    injection: string
    memories: ReadonlyMap<string, string>
  }> {
    await this.persistentMemory.load()

    return {
      injection: this.persistentMemory.getInjection(),
      memories: this.persistentMemory.getMemories(),
    }
  }

  private async loadPromptTemplates(workspaceDir: string): Promise<{
    templates: PromptTemplate[]
    diagnostics: ResourceDiagnostic[]
  }> {
    const templates: PromptTemplate[] = []
    const diagnostics: ResourceDiagnostic[] = []
    const seenNames = new Map<string, string>()

    const dirs: Array<{ path: string; source: 'user' | 'project' }> = [
      { path: `${VITAMIN_HOME}/prompts`, source: 'user' },
      { path: `${workspaceDir}/.vitamin/prompts`, source: 'project' },
    ]

    for (const dir of this.dynamicPromptDirs) {
        dirs.push({ path: dir, source: 'project' })
    }

    for (const dir of dirs) {
      const discovered = await this.discoverPromptFiles(dir.path, dir.source)

      for (const template of discovered.templates) {
        const existing = seenNames.get(template.name)
        if (existing) {
          diagnostics.push({
            type: 'collision',
            category: 'prompt',
            name: template.name,
            filePath: template.filePath,
            message: `Prompt "${template.name}" already loaded from ${existing}`,
          })
          continue
        }

        seenNames.set(template.name, template.filePath)
        templates.push(template)
      }

      diagnostics.push(...discovered.diagnostics)
    }

    return { templates, diagnostics }
  }

  private async discoverPromptFiles(
    dirPath: string,
    source: 'user' | 'project',
  ): Promise<{
    templates: PromptTemplate[]
    diagnostics: ResourceDiagnostic[]
  }> {
    const templates: PromptTemplate[] = []
    const diagnostics: ResourceDiagnostic[] = []

    try {
      const { readdir, readFile } = await import('node:fs/promises')
      const { basename, extname, join } = await import('node:path')

      let entries: string[]
      try {
        entries = (await readdir(dirPath)).filter((entry) => extname(entry) === '.md')
      } catch {
        return { templates, diagnostics }
      }

      for (const entry of entries) {
        const filePath = join(dirPath, entry)
        try {
          const content = await readFile(filePath, 'utf-8')
          templates.push({
            name: basename(entry, '.md'),
            content: content.trim(),
            filePath,
            source,
          })
        } catch (error) {
          diagnostics.push({
            type: 'error',
            category: 'prompt',
            name: basename(entry, '.md'),
            filePath,
            message: `Failed to read prompt file: ${error instanceof Error ? error.message : String(error)}`,
          })
        }
      }
    } catch {
      return { templates, diagnostics }
    }

    return { templates, diagnostics }
  }
}

export function createResourceManager(options?: ResourceManagerOptions): ResourceManager {
  return new DefaultResourceManager(options)
}

export function createInMemoryResourceManager(data?: {
  memories?: Map<string, string>
  promptTemplates?: PromptTemplate[]
}): ResourceManager {
  return new InMemoryResourceManager(data)
}

class InMemoryResourceManager implements ResourceManager {
  private readonly data: {
    memories: Map<string, string>
    promptTemplates: PromptTemplate[]
  }
  private loadedResources: LoadedResources | null = null
  private readonly changeCallbacks = new Set<(resources: LoadedResources) => void>()

  constructor(data?: {
    memories?: Map<string, string>
    promptTemplates?: PromptTemplate[]
  }) {
    this.data = {
      memories: data?.memories ?? new Map(),
      promptTemplates: data?.promptTemplates ?? [],
    }
  }

  get resources(): LoadedResources | null {
    return this.loadedResources
  }

  setPromptDirs(_promptDirs: string[]): void {
    // In-memory resource manager ignores filesystem prompt dirs by design.
  }

  async load(): Promise<LoadedResources> {
    const loaded: LoadedResources = {
      agentInstructions: this.buildInjection(),
      memories: this.data.memories,
      promptTemplates: this.data.promptTemplates,
      diagnostics: [],
    }

    this.loadedResources = loaded

    for (const callback of this.changeCallbacks) {
      callback(loaded)
    }

    return loaded
  }

  async reload(): Promise<LoadedResources> {
    return this.load()
  }

  onChange(callback: (resources: LoadedResources) => void): () => void {
    this.changeCallbacks.add(callback)
    return () => {
      this.changeCallbacks.delete(callback)
    }
  }

  dispose(): void {
    this.changeCallbacks.clear()
    this.loadedResources = null
  }

  private buildInjection(): string {
    if (this.data.memories.size === 0) {
      return ''
    }

    const parts: string[] = ['<agent_memory>']
    for (const [path, content] of this.data.memories) {
      const normalized = content.trim()
      if (!normalized) {
        continue
      }

      parts.push(`# ${path}`)
      parts.push(normalized)
      parts.push('')
    }
    parts.push('</agent_memory>')
    return parts.join('\n')
  }
}
import { 
  PersistentMemorySource, 
  InMemoryMemorySource 
} from './memory-source'
import { 
  FilesystemPromptTemplateSource, 
  InMemoryPromptTemplateSource 
} from './prompt-template-source'
import type { 
  MemoryInjectionSource, 
  PromptTemplateSource 
} from './types'

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

  memorySource?: MemoryInjectionSource
  promptSource?: PromptTemplateSource

  watch?: boolean
}

export interface ResourceManager {
  load(): Promise<LoadedResources>
  reload(): Promise<LoadedResources>
  readonly resources: LoadedResources | null
  onChange(callback: (resources: LoadedResources) => void): () => void
  dispose(): void
}

export class DefaultResourceManager implements ResourceManager {
  private readonly memorySource: MemoryInjectionSource
  private readonly promptSource: PromptTemplateSource
  private readonly watch: boolean
  private loadedResources: LoadedResources | null = null
  private readonly changeCallbacks = new Set<(resources: LoadedResources) => void>()

  constructor(options: ResourceManagerOptions = {}) {
    this.watch = options.watch ?? false

    if (options.memorySource) {
      this.memorySource = options.memorySource
    } else {
      this.memorySource = new PersistentMemorySource({
        workspaceDir: options.workspaceDir,
      })
    }

    if (options.promptSource) {
      this.promptSource = options.promptSource
    } else {
      this.promptSource = new FilesystemPromptTemplateSource({
        workspaceDir: options.workspaceDir,
      })
    }
  }

  get resources(): LoadedResources | null {
    return this.loadedResources
  }

  async load(): Promise<LoadedResources> {
    const [memoryResult, promptsResult] = await Promise.all([
      this.memorySource.load(),
      this.promptSource.load(),
    ])

    const loaded: LoadedResources = {
      agentInstructions: memoryResult.injection,
      memories: memoryResult.memories,
      promptTemplates: promptsResult.templates,
      diagnostics: promptsResult.diagnostics,
    }

    this.loadedResources = loaded

    if (this.watch && this.memorySource.startWatching) {
      this.memorySource.startWatching()
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
    this.memorySource.dispose()
    this.promptSource.dispose?.()
    this.changeCallbacks.clear()
    this.loadedResources = null
  }
}

export function createResourceManager(options?: ResourceManagerOptions): ResourceManager {
  return new DefaultResourceManager(options)
}

export function createInMemoryResourceManager(data?: {
  memories?: Map<string, string>
  promptTemplates?: PromptTemplate[]
}): ResourceManager {
  return new DefaultResourceManager({
    memorySource: new InMemoryMemorySource(data?.memories),
    promptSource: new InMemoryPromptTemplateSource(data?.promptTemplates),
  })
}

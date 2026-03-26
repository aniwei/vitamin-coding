import {
  PersistentMemory,
  FileSystemMemoryStore,
  DEFAULT_MEMORY_SOURCES,
} from '@vitamin/memory'
import { VITAMIN_HOME } from '@vitamin/env'
import { loadSkills, formatSkillsForPrompt } from './skill'

import type { MemorySource, MemoryStore } from '@vitamin/memory'
import type { Skill, SkillDiagnostic, LoadSkillsOptions, SkillReader } from './skill'

export interface PromptTemplate {
  // 模板名称（从文件名推导）
  name: string
  // 模板内容（Markdown body）
  content: string
  // 文件路径 
  filePath: string
  // 来源
  source: 'user' | 'project'
}

export interface LoadedResources {
  // AGENTS.md 合并后的注入文本（用于 system prompt）
  agentInstructions: string
  // AGENTS.md 原始内容映射（path → content）
  memories: ReadonlyMap<string, string>
  // 已加载的 Skills
  skills: Skill[]
  // Skills 的 system prompt 注入片段
  skillsPromptInjection: string
  // Prompt 模板
  promptTemplates: PromptTemplate[]
  // 诊断信息（警告、冲突、错误）
  diagnostics: ResourceDiagnostic[]
}

export interface ResourceDiagnostic {
  type: 'warning' | 'collision' | 'error'
  category: 'memory' | 'skill' | 'prompt'
  name: string
  filePath: string
  message: string
}

export interface ResourceLoaderOptions {
  // 项目工作目录
  workspaceDir?: string
  // AGENTS.md 来源列表（默认 DEFAULT_MEMORY_SOURCES）
  memorySources?: MemorySource[]
  // 自定义 MemoryStore（默认 FileSystemMemoryStore）
  memoryStore?: MemoryStore
  // Skill 加载选项
  skillOptions?: Partial<LoadSkillsOptions>
  // 额外的 SkillReader
  skillReaders?: SkillReader[]
  // 额外的 prompt 模板目录
  promptDirs?: string[]
  // 是否监听文件变更（热重载）
  watch?: boolean
}

export interface ResourceLoader {
  // 加载所有资源
  load(): Promise<LoadedResources>
  // 重新加载
  reload(): Promise<LoadedResources>
  // 获取最近一次加载的资源快照
  get resources(): LoadedResources | null
  // 注册变更回调
  onChange(callback: (resources: LoadedResources) => void): () => void
  // 销毁
  dispose(): void
}

export class DefaultResourceLoader implements ResourceLoader {
  private persistentMemory: PersistentMemory
  private loadedResources: LoadedResources | null = null
  private changeCallbacks = new Set<(resources: LoadedResources) => void>()
  private options: ResourceLoaderOptions

  constructor(options: ResourceLoaderOptions = {}) {
    this.options = options
    const workspaceDir = options.workspaceDir ?? process.cwd()

    const memoryStore = options.memoryStore
      ?? new FileSystemMemoryStore(workspaceDir)

    const memorySources = options.memorySources ?? DEFAULT_MEMORY_SOURCES

    this.persistentMemory = new PersistentMemory(memoryStore, memorySources)
  }

  get resources(): LoadedResources | null {
    return this.loadedResources
  }

  async load(): Promise<LoadedResources> {
    const workspaceDir = this.options.workspaceDir ?? process.cwd()

    // 并行加载三类资源
    const [memoryResult, skillsResult, promptsResult] = await Promise.all([
      this.loadMemory(),
      this.loadSkills(workspaceDir),
      this.loadPromptTemplates(workspaceDir),
    ])

    const diagnostics: ResourceDiagnostic[] = [
      ...skillsResult.diagnostics.map(d => ({
        type: d.type as ResourceDiagnostic['type'],
        category: 'skill' as const,
        name: d.skillName,
        filePath: d.filePath,
        message: d.message,
      })),
      ...promptsResult.diagnostics,
    ]

    const loaded: LoadedResources = {
      agentInstructions: memoryResult.injection,
      memories: memoryResult.memories,
      skills: skillsResult.skills,
      skillsPromptInjection: formatSkillsForPrompt(skillsResult.skills),
      promptTemplates: promptsResult.templates,
      diagnostics,
    }

    this.loadedResources = loaded

    if (this.options.watch) {
      this.persistentMemory.startWatching()
    }

    return loaded
  }

  async reload(): Promise<LoadedResources> {
    return this.load()
  }

  onChange(callback: (resources: LoadedResources) => void): () => void {
    this.changeCallbacks.add(callback)
    return () => { this.changeCallbacks.delete(callback) }
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

  private async loadSkills(workspaceDir: string): Promise<{
    skills: Skill[]
    diagnostics: SkillDiagnostic[]
  }> {
    const opts: LoadSkillsOptions = {
      cwd: workspaceDir,
      ...this.options.skillOptions,
    }

    if (this.options.skillReaders) {
      opts.readers = [
        ...(opts.readers ?? []),
        ...this.options.skillReaders,
      ]
    }

    return loadSkills(opts)
  }

  private async loadPromptTemplates(workspaceDir: string): Promise<{
    templates: PromptTemplate[]
    diagnostics: ResourceDiagnostic[]
  }> {
    const templates: PromptTemplate[] = []
    const diagnostics: ResourceDiagnostic[] = []
    const seenNames = new Map<string, string>()

    // 扫描目录: ~/.vitamin/prompts/ (user) + <cwd>/.vitamin/prompts/ (project) + 额外路径
    const dirs: Array<{ path: string; source: 'user' | 'project' }> = [
      { path: `${VITAMIN_HOME}/prompts`, source: 'user' },
      { path: `${workspaceDir}/.vitamin/prompts`, source: 'project' },
    ]

    if (this.options.promptDirs) {
      for (const d of this.options.promptDirs) {
        dirs.push({ path: d, source: 'project' })
      }
    }

    for (const dir of dirs) {
      const discovered = await this.discoverPromptFiles(dir.path, dir.source)

      for (const tmpl of discovered.templates) {
        const existing = seenNames.get(tmpl.name)
        if (existing) {
          diagnostics.push({
            type: 'collision',
            category: 'prompt',
            name: tmpl.name,
            filePath: tmpl.filePath,
            message: `Prompt "${tmpl.name}" already loaded from ${existing}`,
          })
          continue
        }
        seenNames.set(tmpl.name, tmpl.filePath)
        templates.push(tmpl)
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
      const { join, basename, extname } = await import('node:path')

      let entries: string[]
      try {
        const dirEntries = await readdir(dirPath)
        entries = dirEntries.filter(e => extname(e) === '.md')
      } catch {
        // 目录不存在 — 正常情况，跳过
        return { templates, diagnostics }
      }

      for (const entry of entries) {
        const filePath = join(dirPath, entry)
        try {
          const content = await readFile(filePath, 'utf-8')
          const name = basename(entry, '.md')

          templates.push({
            name,
            content: content.trim(),
            filePath,
            source,
          })
        } catch (err) {
          diagnostics.push({
            type: 'error',
            category: 'prompt',
            name: basename(entry, '.md'),
            filePath: join(dirPath, entry),
            message: `Failed to read prompt file: ${err instanceof Error ? err.message : String(err)}`,
          })
        }
      }
    } catch {
      // fs import 失败（非 Node 环境）— 跳过
    }

    return { templates, diagnostics }
  }
}

// 创建默认的 ResourceLoader 实例
export function createResourceLoader(options?: ResourceLoaderOptions): ResourceLoader {
  return new DefaultResourceLoader(options)
}

// 创建纯内存 ResourceLoader（用于测试）
export function createInMemoryResourceLoader(data?: {
  memories?: Map<string, string>
  skills?: Skill[]
  promptTemplates?: PromptTemplate[]
}): ResourceLoader {
  return new InMemoryResourceLoader(data)
}

// ═══ InMemoryResourceLoader（测试用） ═══

class InMemoryResourceLoader implements ResourceLoader {
  private loadedResources: LoadedResources | null = null
  private changeCallbacks = new Set<(resources: LoadedResources) => void>()
  private data: {
    memories: Map<string, string>
    skills: Skill[]
    promptTemplates: PromptTemplate[]
  }

  constructor(data?: {
    memories?: Map<string, string>
    skills?: Skill[]
    promptTemplates?: PromptTemplate[]
  }) {
    this.data = {
      memories: data?.memories ?? new Map(),
      skills: data?.skills ?? [],
      promptTemplates: data?.promptTemplates ?? [],
    }
  }

  get resources(): LoadedResources | null {
    return this.loadedResources
  }

  async load(): Promise<LoadedResources> {
    const loaded: LoadedResources = {
      agentInstructions: this.buildInjection(),
      memories: this.data.memories,
      skills: this.data.skills,
      skillsPromptInjection: formatSkillsForPrompt(this.data.skills),
      promptTemplates: this.data.promptTemplates,
      diagnostics: [],
    }
    this.loadedResources = loaded
    return loaded
  }

  async reload(): Promise<LoadedResources> {
    return this.load()
  }

  onChange(callback: (resources: LoadedResources) => void): () => void {
    this.changeCallbacks.add(callback)
    return () => { this.changeCallbacks.delete(callback) }
  }

  dispose(): void {
    this.changeCallbacks.clear()
    this.loadedResources = null
  }

  private buildInjection(): string {
    if (this.data.memories.size === 0) return ''
    
    const parts: string[] = ['<agent_memory>']
    for (const [path, content] of this.data.memories) {
      if (content.trim()) {
        parts.push(`# ${path}`)
        parts.push(content.trim())
        parts.push('')
      }
    }
    parts.push('</agent_memory>')
    return parts.join('\n')
  }
}

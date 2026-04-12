import { createLogger } from '@vitamin/shared'
import { buildMemoryInjection } from './prompts'

import type { MemorySource, MemoryStore } from './types'

const log = createLogger('@vitamin/memory:persistent')

export const DEFAULT_MEMORY_SOURCES: MemorySource[] = [
  { path: '~/.vitamin/AGENTS.md', writable: true },
  { path: './.vitamin/AGENTS.md', writable: true },
  { path: './AGENTS.md', writable: false },
]

// L1 Persistent Memory — 加载并管理持久化知识文件。
// AGENTS.md 文件按优先级从多个 source 加载：
// 1. 全局用户偏好 (~/.vitamin/AGENTS.md)
// 2. 项目级知识 (./.vitamin/AGENTS.md)
// 3. 社区 AGENTS.md (./AGENTS.md, 只读)
export class PersistentMemory {
  private memories = new Map<string, string>()
  private unwatch?: () => void

  constructor(
    private readonly store: MemoryStore,
    private readonly sources: MemorySource[] = DEFAULT_MEMORY_SOURCES,
  ) {}

  // 加载所有知识 sources
  async load(): Promise<void> {
    this.memories = await this.store.load(this.sources)
    log.info(`Loaded ${this.memories.size} memory source(s)`)
  }

  // 重新加载所有 sources
  async reload(): Promise<void> {
    await this.load()
  }

  // 获取格式化的注入文本（用于 system prompt）
  getInjection(): string {
    return buildMemoryInjection(this.memories)
  }

  // 获取原始记忆内容
  getMemories(): ReadonlyMap<string, string> {
    return this.memories
  }

  // 启动文件监听（热重载）
  watching(): void {
    if (this.unwatch || !this.store.watch) return
    this.unwatch = this.store.watch(this.sources, (path) => {
      log.info(`Memory source changed: ${path}, reloading...`)
      void this.reload()
    })
  }

  // 停止文件监听
  stop(): void {
    this.unwatch?.()
    this.unwatch = undefined
  }

  dispose(): void {
    this.stop()
    this.memories.clear()
  }
}

// 纯内存 MemoryStore — 用于测试
export class InMemoryMemoryStore implements MemoryStore {
  private data = new Map<string, string>()

  // 预设内容（测试用）
  set(path: string, content: string): void {
    this.data.set(path, content)
  }

  async load(sources: MemorySource[]): Promise<Map<string, string>> {
    const result = new Map<string, string>()
    for (const source of sources) {
      const content = this.data.get(source.path)
      if (content !== undefined) {
        result.set(source.path, content)
      }
    }
    return result
  }

  async write(path: string, content: string): Promise<void> {
    this.data.set(path, content)
  }
}

// 文件系统 MemoryStore — 基于 Node.js fs 模块。
//
// 延迟加载 fs，不在模块顶层 import，
// 确保在非 Node 环境（如浏览器 SDK）不会报错。
export class FileSystemMemoryStore implements MemoryStore {
  private cwd: string

  constructor(cwd = process.cwd()) {
    this.cwd = cwd
  }

  async load(sources: MemorySource[]): Promise<Map<string, string>> {
    const { readFile } = await import('node:fs/promises')
    const { resolve, isAbsolute } = await import('node:path')
    const { homedir } = await import('node:os')

    const result = new Map<string, string>()

    for (const source of sources) {
      const resolvedPath = this.resolvePath(source.path, resolve, isAbsolute, homedir)
      try {
        const content = await readFile(resolvedPath, 'utf-8')
        result.set(source.path, content)
      } catch {
        // 文件不存在则跳过
      }
    }

    return result
  }

  async write(path: string, content: string): Promise<void> {
    const { writeFile, mkdir } = await import('node:fs/promises')
    const { resolve, dirname, isAbsolute } = await import('node:path')
    const { homedir } = await import('node:os')

    const resolvedPath = this.resolvePath(path, resolve, isAbsolute, homedir)
    await mkdir(dirname(resolvedPath), { recursive: true })
    await writeFile(resolvedPath, content, 'utf-8')
  }

  private resolvePath(
    filePath: string,
    resolve: (base: string, ...paths: string[]) => string,
    isAbsolute: (p: string) => boolean,
    homedir: () => string,
  ): string {
    const expanded = filePath.startsWith('~/') ? filePath.replace('~/', `${homedir()}/`) : filePath

    return isAbsolute(expanded) ? expanded : resolve(this.cwd, expanded)
  }
}

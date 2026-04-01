import {
  PersistentMemory,
  FileSystemMemoryStore,
  DEFAULT_MEMORY_SOURCES,
} from '@vitamin/memory'

import type { MemorySource, MemoryStore } from '@vitamin/memory'
import type { MemoryInjectionSource, MemoryInjectionResult } from './types'

export interface PersistentMemorySourceOptions {
  workspaceDir?: string
  memorySource?: MemorySource[]
  memoryStore?: MemoryStore
}

export class PersistentMemorySource implements MemoryInjectionSource {
  private readonly persistentMemory: PersistentMemory

  constructor(options: PersistentMemorySourceOptions = {}) {
    const { workspaceDir, memorySource, memoryStore } = options
    
    this.persistentMemory = new PersistentMemory(
      memoryStore ?? new FileSystemMemoryStore(workspaceDir), 
      memorySource ?? DEFAULT_MEMORY_SOURCES
    )
  }

  async load(): Promise<MemoryInjectionResult> {
    await this.persistentMemory.load()

    return {
      injection: this.persistentMemory.getInjection(),
      memories: this.persistentMemory.getMemories(),
    }
  }

  watching(): void {
    this.persistentMemory.watching()
  }

  dispose(): void {
    this.persistentMemory.dispose()
  }
}

export class InMemoryMemorySource implements MemoryInjectionSource {
  private readonly memories: Map<string, string>

  constructor(memories?: Map<string, string>) {
    this.memories = memories ?? new Map()
  }

  async load(): Promise<MemoryInjectionResult> {
    return {
      injection: this.buildInjection(),
      memories: this.memories,
    }
  }

  dispose(): void {
    // no-op
  }

  private buildInjection(): string {
    if (this.memories.size === 0) {
      return ''
    }

    const parts: string[] = ['<agent_memory>']
    for (const [path, content] of this.memories) {
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

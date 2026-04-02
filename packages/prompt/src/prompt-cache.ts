import type { PromptEntry } from './types'

/**
 * Prompt cache
 * Caches prompt sections by key, with version comparison and lazy assembly
 */
export class PromptCache {
  private sections = new Map<string, PromptEntry>()
  private assembled: string | null = null

  set(key: string, content: string, version = 0): void {
    const existing = this.sections.get(key)
    if (existing && existing.content === content && existing.version === version) {
      return
    }
    this.sections.set(key, { key, content, version })
    this.assembled = null
  }

  get(key: string): string | undefined {
    return this.sections.get(key)?.content
  }

  has(key: string): boolean {
    return this.sections.has(key)
  }

  getVersion(key: string): number {
    return this.sections.get(key)?.version ?? -1
  }

  delete(key: string): void {
    if (this.sections.delete(key)) {
      this.assembled = null
    }
  }

  assemble(basePrompt: string): string {
    if (this.assembled !== null) return this.assembled

    const parts = [basePrompt]
    for (const section of this.sections.values()) {
      if (section.content) {
        parts.push(section.content)
      }
    }
    this.assembled = parts.join('\n\n')
    return this.assembled
  }

  invalidate(): void {
    this.assembled = null
  }

  clear(): void {
    this.sections.clear()
    this.assembled = null
  }
}

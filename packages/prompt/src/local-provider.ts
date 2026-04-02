import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { LocalProviderOptions, PromptEntry, PromptProvider } from './types'

/**
 * Local file system prompt provider
 * Reads markdown files from the specified directory as prompt content
 *
 * Directory structure maps to key:
 *   baseDir/lead-guidance.md → "lead-guidance"
 *   baseDir/lesson/session-end-learning.md → "lesson/session-end-learning"
 */
export class LocalPromptProvider implements PromptProvider {
  private readonly baseDir: string
  private readonly extension: string

  constructor(options: Omit<LocalProviderOptions, 'type'>) {
    this.baseDir = options.baseDir
    this.extension = options.extension ?? '.md'
  }

  async load(key: string): Promise<PromptEntry | null> {
    const filePath = join(this.baseDir, `${key}${this.extension}`)
    try {
      const content = await readFile(filePath, 'utf-8')
      const info = await stat(filePath)
      return {
        key,
        content: content.trim(),
        version: Math.floor(info.mtimeMs),
      }
    } catch {
      return null
    }
  }

  async list(): Promise<string[]> {
    return this.walk(this.baseDir)
  }

  async loadMany(keys: string[]): Promise<Map<string, PromptEntry>> {
    const results = new Map<string, PromptEntry>()
    const entries = await Promise.all(keys.map((k) => this.load(k)))
    for (const entry of entries) {
      if (entry) {
        results.set(entry.key, entry)
      }
    }
    return results
  }

  private async walk(dir: string): Promise<string[]> {
    const keys: string[] = []
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          const subKeys = await this.walk(fullPath)
          keys.push(...subKeys)
        } else if (entry.name.endsWith(this.extension)) {
          const rel = relative(this.baseDir, fullPath)
          const key = rel
            .slice(0, -this.extension.length)
            .split(sep)
            .join('/')
          keys.push(key)
        }
      }
    } catch {
      // directory doesn't exist, return empty
    }
    return keys
  }
}

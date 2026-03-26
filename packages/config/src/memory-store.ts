import type { ConfigStore } from './store'
import type { VitaminConfig } from './types'

export class InMemoryConfigStore implements ConfigStore {
  readonly type = 'memory' as const
  private data = new Map<string, string>()

  constructor(initial?: Record<string, string>) {
    if (initial) {
      for (const [key, value] of Object.entries(initial)) {
        this.data.set(key, value)
      }
    }
  }

  async read(path: string): Promise<string | undefined> {
    return this.data.get(path)
  }

  async write(path: string, config: Partial<VitaminConfig>): Promise<void> {
    this.data.set(path, JSON.stringify(config, null, 2))
  }

  async exists(path: string): Promise<boolean> {
    return this.data.has(path)
  }
}

import { createPersistence } from '@vitamin/persistence'
import { safeStringify } from '@vitamin/shared'

import type { Persistence, Snapshot } from '@vitamin/persistence'
import type {
  SettingStore,
  FileSettingStoreOptions,
  HttpSettingStoreOptions,
} from './store'
import type { VitaminSetting } from './types'

interface StoredSetting {
  content: string
}

const SNAPSHOT_VERSION = 1

class PersistenceSettingStore implements SettingStore {
  readonly type: 'file' | 'http'
  private readonly persistence: Persistence<StoredSetting>

  constructor(type: 'file' | 'http', persistence: Persistence<StoredSetting>) {
    this.type = type
    this.persistence = persistence
  }

  async read(path: string): Promise<string | undefined> {
    const snapshot = await this.persistence.load(path)
    return snapshot?.data.content
  }

  async write(path: string, config: Partial<VitaminSetting>): Promise<void> {
    const existing = await this.persistence.load(path)
    const now = Date.now()

    const snapshot: Snapshot<StoredSetting> = {
      version: SNAPSHOT_VERSION,
      id: path,
      data: {
        content: safeStringify(config, 2),
      },
      metadata: {
        createdAt: existing?.metadata.createdAt ?? now,
        updatedAt: now,
        tags: ['setting'],
      },
    }

    await this.persistence.save(snapshot)
  }

  async exists(path: string): Promise<boolean> {
    return (await this.persistence.load(path)) !== null
  }
}

export function createFileSettingStore(options: FileSettingStoreOptions): SettingStore {
  const persistence = createPersistence<StoredSetting>({
    type: 'file',
    baseDir: options.baseDir,
    extension: options.extension,
  })

  return new PersistenceSettingStore('file', persistence)
}

export function createHttpSettingStore(options: HttpSettingStoreOptions): SettingStore {
  const persistence = createPersistence<StoredSetting>({
    type: 'http',
    baseUrl: options.baseUrl,
    getAuth: options.getAuth,
    getHeaders: options.getHeaders,
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
  })

  return new PersistenceSettingStore('http', persistence)
}

import { InMemorySettingStore } from './memory-store'
import { createFileSettingStore, createHttpSettingStore } from './persistence-store'
import type { XMarsSetting } from './types'

export type StorageType = 'memory' | 'file' | 'http'

export interface SettingStore {
  readonly type: StorageType
  read(path: string): Promise<string | undefined>
  write(path: string, config: Partial<XMarsSetting>): Promise<void>
  exists(path: string): Promise<boolean>
}

export interface FileSettingStoreOptions {
  type: 'file'
  baseDir: string
  extension?: string
}

export interface HttpSettingStoreOptions {
  type: 'http'
  baseUrl: string
  getAuth: () => Promise<{ token: string }>
  getHeaders?: () => Promise<Record<string, string>>
  fetch: typeof globalThis.fetch
  timeoutMs?: number
}

export interface InMemorySettingStoreOptions {
  type: 'memory'
  initial?: Record<string, string>
}

export type SettingStoreOptions =
  | FileSettingStoreOptions
  | HttpSettingStoreOptions
  | InMemorySettingStoreOptions

export function createSettingStore(options: SettingStoreOptions): SettingStore {
  switch (options.type) {
    case 'file':
      return createFileSettingStore(options)
    case 'http':
      return createHttpSettingStore(options)
    case 'memory':
      return new InMemorySettingStore(options.initial)
  }
}

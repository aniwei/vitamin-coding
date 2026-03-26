import { LocalConfigStore } from './local-store'
import { RemoteConfigStore } from './remote-store'
import { InMemoryConfigStore } from './memory-store'
import type { VitaminConfig } from './types'

export type StorageType = 'local' | 'remote' | 'memory'

// 统一配置持久化接口
export interface ConfigStore {
  readonly type: StorageType
  read(path: string): Promise<string | undefined>
  write(path: string, config: Partial<VitaminConfig>): Promise<void>
  exists(path: string): Promise<boolean>
}

// 本地文件存储选项
export interface LocalConfigStoreOptions {
  type: 'local'
}

// 远程 HTTP 存储选项
export interface RemoteConfigStoreOptions {
  type: 'remote'
  baseUrl: string
  getAuth?: () => Promise<{ token: string }>
  timeout?: number
  fetch?: typeof globalThis.fetch
}

// 内存存储选项（测试用）
export interface InMemoryConfigStoreOptions {
  type: 'memory'
  initial?: Record<string, string>
}

export type ConfigStoreOptions =
  | LocalConfigStoreOptions
  | RemoteConfigStoreOptions
  | InMemoryConfigStoreOptions

// 工厂函数 — 按 type 分发
export function createConfigStore(options: ConfigStoreOptions): ConfigStore {
  switch (options.type) {
    case 'local':
      return new LocalConfigStore()
    case 'remote':
      return new RemoteConfigStore(options)
    case 'memory':
      return new InMemoryConfigStore(options.initial)
  }
}

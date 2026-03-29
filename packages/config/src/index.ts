export type {
  VitaminConfig,
  AgentConfig,
  CategoryConfig,
  ConfigWarning,
  LoadConfigOptions,
} from './types'

export { VITAMIN_DEFAULT_CONFIG } from './types'

export {
  VitaminConfigSchema,
  VitaminConfigStrictSchema,
  AgentConfigSchema,
  CategoryConfigSchema,
  LogLevelSchema,
} from './schema'
export type { VitaminConfigFromSchema } from './schema'

export { 
  migrate, 
  registerMigration, 
  resetMigrations 
} from './migrator'
export type { Migration } from './migrator'

export { loadConfig, ConfigLoader } from './config'

export { 
  createConfigWatcher, 
  ConfigWatcher 
} from './watcher'
export type { ConfigWatcherOptions } from './watcher'

export { createConfigStore } from './store'
export type {
  ConfigStore,
  StorageType,
  ConfigStoreOptions,
  LocalConfigStoreOptions,
  RemoteConfigStoreOptions,
  InMemoryConfigStoreOptions,
} from './store'

export { LocalConfigStore } from './local-store'
export { RemoteConfigStore } from './remote-store'
export { InMemoryConfigStore } from './memory-store'
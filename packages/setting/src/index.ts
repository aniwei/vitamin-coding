export type {
  VitaminSetting,
  AgentConfig,
  CategoryConfig,
  SettingWarning,
  ConfigWarning,
  LoadSettingOptions,
  LoadConfigOptions,
} from './types'

export { VITAMIN_DEFAULT_CONFIG } from './types'

export {
  VitaminSettingSchema,
  VitaminSettingStrictSchema,
  AgentConfigSchema,
  CategoryConfigSchema,
  LogLevelSchema,
} from './schema'
export type { VitaminSettingFromSchema } from './schema'

export { 
  migrate, 
  registerMigration, 
  resetMigrations 
} from './migrator'
export type { Migration } from './migrator'

export { loadSetting, SettingLoader } from './setting'

export { 
  createSettingWatcher,
  SettingWatcher,
} from './watcher'
export type {
  SettingWatcherOptions,
} from './watcher'

export { createSettingStore } from './store'
export type {
  SettingStore,
  StorageType,
  SettingStoreOptions,
  FileSettingStoreOptions,
  HttpSettingStoreOptions,
  InMemorySettingStoreOptions
} from './store'

export { FileSettingStore } from './file-store'
export { RemoteSettingStore } from './http-store'
export { InMemorySettingStore } from './memory-store'
export {
  createFileSettingStore,
  createHttpSettingStore,
} from './persistence-store'

// Presets (JSON data)
export { BUILTIN_AGENT_PROFILES, COPILOT_MODELS, TASK_TYPE_PROFILE_MAP } from './presets'
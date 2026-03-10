export type {
  VitaminConfig,
  AgentConfig,
  CategoryConfig,
  ConfigWarning,
  LoadConfigOptions,
  LoadConfigResult,
} from './types'

export {
  VitaminConfigSchema,
  VitaminConfigStrictSchema,
  AgentConfigSchema,
  CategoryConfigSchema,
  LogLevelSchema,
} from './schema'
export type { VitaminConfigFromSchema } from './schema'


export { migrate, registerMigration, resetMigrations } from './migrator'
export type { Migration } from './migrator'

export { loadConfig } from './loader'
export { ConfigManager, createConfigManager } from './manager'
export type { ConfigManagerOptions } from './manager'
export type { ConfigStore } from './storage'
export { createConfigWatcher, ConfigWatcher } from './watcher'
export type { ConfigWatcherOptions } from './watcher'

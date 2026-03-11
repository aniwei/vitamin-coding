export type {
  VitaminConfig,
  AgentConfig,
  CategoryConfig,
  ConfigWarning,
  LoadConfigOptions,
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

export { createConfigWatcher, ConfigWatcher } from './watcher'
export type { ConfigWatcherOptions } from './watcher'

export { PROJ_CONFIG_PATH, USER_CONFIG_PATH, VITAMIN_CONFIG } from './constant'
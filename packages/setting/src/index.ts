export type {
  VitaminSetting,
  VitaminSettingFromSchema,
  VitaminSettingKey,
  AgentConfig,
  CategoryConfig,
  LogLevel,
  ToolPreset,
  PermissionMode,
  PermissionRuleConfig,
  PermissionPolicySetting,
  WorkflowSlot,
  SettingWarning,
  ConfigWarning,
  LoadSettingOptions,
  LoadConfigOptions,
} from './types'

export {
  BUILTIN_REVIEWER_AGENTS,
  COMPACTION_STRATEGIES,
  LOG_LEVELS,
  PERMISSION_MODES,
  TOOL_PRESETS,
  VITAMIN_DEFAULT_CONFIG,
  VITAMIN_SETTING_KEYS,
  WORKFLOW_SLOTS,
} from './types'

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
export type {
  XMarsSetting,
  XMarsSettingFromSchema,
  XMarsSettingKey,
  AgentOptions,
  CategoryConfig,
  LogLevel,
  ToolPreset,
  PermissionMode,
  PermissionRuleConfig,
  PermissionPolicySetting,
  CommandHookMatcherSetting,
  CommandHookSetting,
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
  X_MARS_DEFAULT_CONFIG,
  X_MARS_SETTING_KEYS,
} from './types'

export { migrate, registerMigration, resetMigrations } from './migrator'
export type { Migration } from './migrator'

export { loadSetting, SettingLoader } from './setting'
export { discoverFileAgents, parseAgentMarkdown } from './agent-files'
export type { DiscoverFileAgentsOptions, FileAgentProfile } from './agent-files'

export { createSettingWatcher, SettingWatcher } from './watcher'
export type { SettingWatcherOptions } from './watcher'

export { createSettingStore } from './store'
export type {
  SettingStore,
  StorageType,
  SettingStoreOptions,
  FileSettingStoreOptions,
  HttpSettingStoreOptions,
  InMemorySettingStoreOptions,
} from './store'

export { FileSettingStore } from './file-store'
export { RemoteSettingStore } from './http-store'
export { InMemorySettingStore } from './memory-store'
export { createFileSettingStore, createHttpSettingStore } from './persistence-store'

export { BUILTIN_AGENT_PROFILES, TASK_TYPE_PROFILE_MAP } from './presets'

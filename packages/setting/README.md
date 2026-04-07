# @vitamin/setting

## 模块定位
提供设置仓库、监听器、迁移器与配置读取流程。

## 当前状态（基于源码）
- 包目录：`packages/setting`
- 源码文件数：14
- 测试文件数：6
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `data/`
  - `file-store.ts`
  - `http-store.ts`
  - `index.ts`
  - `memory-store.ts`
  - `migrator.ts`
  - `persistence-store.ts`
  - `presets.ts`
  - `setting.ts`
  - `store.ts`
  - `types.ts`
  - `watcher.ts`
- `tests/`
  - `loader.test.ts`
  - `manager.test.ts`
  - `migrator.test.ts`
  - `schema.test.ts`
  - `store.test.ts`
  - `watcher.test.ts`

## 公开导出
```ts
export type { VitaminSetting, VitaminSettingFromSchema, VitaminSettingKey, AgentConfig, CategoryConfig, LogLevel, ToolPreset, PermissionMode, PermissionRuleConfig, PermissionPolicySetting, WorkflowSlot, SettingWarning, ConfigWarning, LoadSettingOptions, LoadConfigOptions, } from './types'
export { BUILTIN_REVIEWER_AGENTS, COMPACTION_STRATEGIES, LOG_LEVELS, PERMISSION_MODES, TOOL_PRESETS, VITAMIN_DEFAULT_CONFIG, VITAMIN_SETTING_KEYS, WORKFLOW_SLOTS, } from './types'
export { migrate, registerMigration, resetMigrations } from './migrator'
export type { Migration } from './migrator'
export { loadSetting, SettingLoader } from './setting'
export { createSettingWatcher, SettingWatcher, } from './watcher'
export type { SettingWatcherOptions, } from './watcher'
export { createSettingStore } from './store'
export type { SettingStore, StorageType, SettingStoreOptions, FileSettingStoreOptions, HttpSettingStoreOptions, InMemorySettingStoreOptions } from './store'
export { FileSettingStore } from './file-store'
export { RemoteSettingStore } from './http-store'
export { InMemorySettingStore } from './memory-store'
export { createFileSettingStore, createHttpSettingStore, } from './persistence-store'
export { BUILTIN_AGENT_PROFILES, COPILOT_MODELS, TASK_TYPE_PROFILE_MAP } from './presets'
```

## 开发命令
- `pnpm --filter @vitamin/setting build`
- `pnpm --filter @vitamin/setting typecheck:project`
- `pnpm --filter @vitamin/setting typecheck:file`
- `pnpm --filter @vitamin/setting typecheck`
- `pnpm --filter @vitamin/setting clean`

## 关联 Vitamin 包
- `@vitamin/persistence`
- `@vitamin/shared`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07

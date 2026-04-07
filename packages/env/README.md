# @vitamin/env

## 模块定位
管理运行环境变量与环境读取工具。

## 当前状态（基于源码）
- 包目录：`packages/env`
- 源码文件数：1
- 测试文件数：1
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `index.ts`
- `tests/`
  - `env.test.ts`

## 公开导出
```ts
export const normalizeEnv = (value: string | undefined, defaultValue: number): number => { if (value === undefined) { return defaultValue }
export const VITAMIN_USER_AGENT = `vitamin/${readPackageVersion()}`
export const VITAMIN_ROOT = '.vitamin'
export const VITAMIN_HOME = normalizePath(process.env['VITAMIN_HOME'] || `${homedir()}/${VITAMIN_ROOT}`)
export const VITAMIN_USER_CONFIG_DIR = normalizePath(homedir() + '/.config/vitamin')
export const VITAMIN_PROJECT_DIR = normalizePath(`${process.cwd()}/${VITAMIN_ROOT}`)
export const VITAMIN_PROJECT_ROOT = VITAMIN_PROJECT_DIR
export const LOG_FILE = normalizePath(process.env['VITAMIN_LOG_FILE'] ?? '/tmp/vitamin.log')
export const LOG_LEVEL = process.env['VITAMIN_LOG_LEVEL'] as ('info' | 'warn' | 'error' | 'debug' | 'trace' | 'fatal') || (process.env.NODE_ENV === 'production' ? 'info' : 'trace')
export const TOOLS_SEARCH_MAX_OUTPUT_LINES = normalizeEnv(process.env['TOOLS_SEARCH_MAX_OUTPUT_LINES'], 500)
export const TOOLS_LS_MAX_ENTRIES = normalizeEnv(process.env['TOOLS_LS_MAX_ENTRIES'], 500)
export const TOOLS_MAX_OUTPUT_LINES = normalizeEnv(process.env['TOOLS_MAX_OUTPUT_LINES'], 2000)
export const TOOLS_MAX_OUTPUT_BYTES = normalizeEnv(process.env['TOOLS_MAX_OUTPUT_BYTES'], 60 * 1024)
export const TOOLS_EXECUTE_TIMEOUT_MS = normalizeEnv(process.env['TOOLS_EXECUTE_TIMEOUT_MS'], 30_000)
export const TOOLS_BINARY_DOWNLOAD_TIMEOUT_MS = normalizeEnv(process.env['TOOLS_BINARY_DOWNLOAD_TIMEOUT_MS'], 1_200_000)
export const AGENT_TOOLS_MAX_TURNS = normalizeEnv(process.env['AGENT_TOOLS_MAX_TURNS'], 25)
export const MEMORY_COMPACTION_TRIGGER_FRACTION = 0.85
export const MEMORY_COMPACTION_KEEP_RECENT_FRACTION = 0.10
export const MEMORY_COMPACTION_RESERVE_TOKENS = 16384
export const MEMORY_PRUNE_TRIGGER_FRACTION = 0.70
export const MEMORY_PRUNE_PROTECT_FRACTION = 0.15
export const MEMORY_PRUNE_MINIMUM_TOKENS = 20000
export const MEMORY_PRUNE_TRUNCATE_MAX_LENGTH = 2000
export const MEMORY_TOOL_WRITE = 'write'
export const MEMORY_TOOL_EDIT = 'edit'
export const MEMORY_TOOL_APPLY_PATCH = 'apply_patch'
export const MEMORY_TOOL_CREATE_FILE = 'create_file'
export const MEMORY_TOOL_EDIT_NOTEBOOK_FILE = 'edit_notebook_file'
export const MEMORY_TOOL_READ = 'read'
export const MEMORY_TOOL_GREP = 'grep'
export const MEMORY_TOOL_FIND = 'find'
export const MEMORY_TOOL_LS = 'ls'
export const MEMORY_LEGACY_TOOL_READ_FILE = 'read_file'
export const MEMORY_LEGACY_TOOL_GREP_SEARCH = 'grep_search'
export const MEMORY_LEGACY_TOOL_FILE_SEARCH = 'file_search'
export const MEMORY_LEGACY_TOOL_WRITE_FILE = 'write_file'
export const MEMORY_LEGACY_TOOL_EDIT_FILE = 'edit_file'
export const MEMORY_LEGACY_TOOL_REPLACE_STRING_IN_FILE = 'replace_string_in_file'
export const MEMORY_ARCHIVE_SNAPSHOT_VERSION = normalizeEnv(process.env['MEMORY_ARCHIVE_SNAPSHOT_VERSION'], 1)
export const SETTING_OFFLINE_MODE_ENABLED = process.env['VITAMIN_OFFLINE'] === '1' || process.env['VITAMIN_OFFLINE']?.toLowerCase() === 'true' || process.env['VITAMIN_OFFLINE']?.toLowerCase() === 'yes'
```

## 开发命令
- `pnpm --filter @vitamin/env build`
- `pnpm --filter @vitamin/env typecheck:project`
- `pnpm --filter @vitamin/env typecheck:file`
- `pnpm --filter @vitamin/env typecheck`
- `pnpm --filter @vitamin/env clean`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07

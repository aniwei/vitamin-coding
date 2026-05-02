import { homedir } from 'node:os'
import { readFileSync } from 'node:fs'
import { normalize, sep } from 'node:path'

export const normalizeEnv = (value: string | undefined, defaultValue: number): number => {
  if (value === undefined) {
    return defaultValue
  }

  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed <= 0) {
    console.warn(`Invalid environment variable value: ${value}. Using default: ${defaultValue}`)
    return defaultValue
  }

  return parsed
}

function normalizePath(path: string): string {
  return normalize(path).replaceAll(sep === '\\' ? '\\' : sep, '/')
}

const decode = (s: string) => atob(s)

function readPackageVersion(): string {
  try {
    const __dirname = normalizePath(new URL('.', import.meta.url).pathname)
    const packageJsonPath = normalizePath(`${__dirname}/../package.json`)
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    return packageJson.version || 'unknown'
  } catch (error) {
    console.warn('Failed to read package version:', error)
    return 'unknown'
  }
}

/// 环境变量和常量定义
export const VITAMIN_USER_AGENT = `vitamin/${readPackageVersion()}`
export const VITAMIN_ROOT = '.vitamin'
export const VITAMIN_HOME = normalizePath(
  process.env['VITAMIN_HOME'] || `${homedir()}/${VITAMIN_ROOT}`,
)
export const VITAMIN_USER_CONFIG_DIR = normalizePath(`${homedir()}/.config/vitamin`)
export const VITAMIN_PROJECT_DIR = normalizePath(`${process.cwd()}/${VITAMIN_ROOT}`)
export const VITAMIN_PROJECT_ROOT = VITAMIN_PROJECT_DIR

export const LOG_FILE = normalizePath(process.env['VITAMIN_LOG_FILE'] ?? '/tmp/vitamin.log')
export const LOG_LEVEL =
  (process.env['VITAMIN_LOG_LEVEL'] as 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'fatal') ||
  (process.env.NODE_ENV === 'production' ? 'info' : 'trace')

export const TOOLS_SEARCH_MAX_OUTPUT_LINES = normalizeEnv(
  process.env['TOOLS_SEARCH_MAX_OUTPUT_LINES'],
  500,
)
export const TOOLS_LS_MAX_ENTRIES = normalizeEnv(process.env['TOOLS_LS_MAX_ENTRIES'], 500)
export const TOOLS_MAX_OUTPUT_LINES = normalizeEnv(process.env['TOOLS_MAX_OUTPUT_LINES'], 2000)
export const TOOLS_MAX_OUTPUT_BYTES = normalizeEnv(process.env['TOOLS_MAX_OUTPUT_BYTES'], 60 * 1024)
export const TOOLS_EXECUTE_TIMEOUT_MS = normalizeEnv(
  process.env['TOOLS_EXECUTE_TIMEOUT_MS'],
  30_000,
)
export const TOOLS_BINARY_DOWNLOAD_TIMEOUT_MS = normalizeEnv(
  process.env['TOOLS_BINARY_DOWNLOAD_TIMEOUT_MS'],
  1_200_000,
)

export const AGENT_TOOLS_MAX_TURNS = normalizeEnv(process.env['AGENT_TOOLS_MAX_TURNS'], 25)

// @vitamin/memory 默认阈值与工具分类常量
export const MEMORY_COMPACTION_TRIGGER_FRACTION = 0.85
export const MEMORY_COMPACTION_KEEP_RECENT_FRACTION = 0.1
export const MEMORY_COMPACTION_RESERVE_TOKENS = 16384

export const MEMORY_PRUNE_TRIGGER_FRACTION = 0.7
export const MEMORY_PRUNE_PROTECT_FRACTION = 0.15
export const MEMORY_PRUNE_MINIMUM_TOKENS = 20000
export const MEMORY_PRUNE_TRUNCATE_MAX_LENGTH = 2000

export const MEMORY_SNIP_MAX_OUTPUT_CHARS = 8000
export const MEMORY_SNIP_KEEP_HEAD_LINES = 50
export const MEMORY_SNIP_KEEP_TAIL_LINES = 30

export const MEMORY_MICRO_COMPACT_TRIGGER_FRACTION = 0.8
export const MEMORY_MICRO_COMPACT_WINDOW_FRACTION = 0.3
export const MEMORY_MICRO_COMPACT_RESERVE_TOKENS = 4096
export const MEMORY_TIME_MICRO_AGE_THRESHOLD_MS = 300_000
export const MEMORY_TIME_MICRO_MIN_OUTPUT_TOKENS = 50

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
export const MEMORY_ARCHIVE_SNAPSHOT_VERSION = normalizeEnv(
  process.env['MEMORY_ARCHIVE_SNAPSHOT_VERSION'],
  1,
)

export const SETTING_OFFLINE_MODE_ENABLED =
  process.env['VITAMIN_OFFLINE'] === '1' ||
  process.env['VITAMIN_OFFLINE']?.toLowerCase() === 'true' ||
  process.env['VITAMIN_OFFLINE']?.toLowerCase() === 'yes'

export const SESSION_DIR = process.env['VITAMIN_SESSION_DIR']
  ? normalizePath(process.env['VITAMIN_SESSION_DIR'])
  : undefined
export const SESSION_REMOTE_URL = process.env['VITAMIN_SESSION_REMOTE_URL'] || undefined
export const SESSION_IDLE_TIMEOUT_MS = normalizeEnv(
  process.env['VITAMIN_SESSION_IDLE_TIMEOUT_MS'],
  30 * 60 * 1000,
)
export const SESSION_MAX = normalizeEnv(process.env['VITAMIN_SESSION_MAX'], 50)
export const SESSION_PAGE_SIZE = normalizeEnv(process.env['VITAMIN_SESSION_PAGE_SIZE'], 20)
export const SESSION_SNAPSHOT_VERSION = normalizeEnv(
  process.env['VITAMIN_SESSION_SNAPSHOT_VERSION'],
  1,
)

export const CHECKPOINT_DIR = process.env['VITAMIN_CHECKPOINT_DIR']
  ? normalizePath(process.env['VITAMIN_CHECKPOINT_DIR'])
  : undefined
export const CHECKPOINT_SNAPSHOT_VERSION = normalizeEnv(
  process.env['VITAMIN_CHECKPOINT_SNAPSHOT_VERSION'],
  1,
)

export const AUTH_PATH = normalizePath(`${VITAMIN_USER_CONFIG_DIR}/auth.json`)

export const GITHUB_CLIENT_ID = decode(
  process.env['GITHUB_CLIENT_ID'] || 'SXYxLmI1MDdhMDhjODdlY2ZlOTg=',
)
export const GITHUB_SCOPE = process.env['GITHUB_SCOPE'] || 'read:user'
export const GITHUB_COPILOT_USER_AGENT =
  process.env['GITHUB_COPILOT_USER_AGENT'] || 'GitHubCopilotChat/0.35.0'

import { normalizePath } from "./path"

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

/// 常量定义
// 日志文件路径，默认为 /tmp/vitamin.log
export const LOG_FILE = normalizePath(process.env['VITAMIN_LOG_FILE'] ?? '/tmp/vitamin.log')

// grep 工具的默认行数限制（默认 500 行）
export const TOOLS_GREP_MAX_OUTPUT_LINES = normalizeEnv(process.env['TOOLS_GREP_MAX_OUTPUT_LINES'], 500)

// ls 工具的限制（默认 500 条目）
export const TOOLS_LS_MAX_ENTRIES = normalizeEnv(process.env['TOOLS_LS_MAX_ENTRIES'], 500)

// 工具输出的默认行数限制（默认 2000 行）
export const TOOLS_MAX_OUTPUT_LINES = normalizeEnv(process.env['TOOLS_MAX_OUTPUT_LINES'], 2000)

// 工具输出的默认字节数限制（默认 60 KB）
export const TOOLS_MAX_OUTPUT_BYTES = normalizeEnv(process.env['TOOLS_MAX_OUTPUT_BYTES'], 60 * 1024) // 60KB

// 工具执行的默认超时时间（毫秒）
export const TOOLS_EXECUTE_TIMEOUT = normalizeEnv(process.env['TOOLS_EXECUTE_TIMEOUT'], 30_000) // 30秒

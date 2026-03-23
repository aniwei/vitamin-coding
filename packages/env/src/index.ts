import { homedir } from 'node:os'
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

export const VITAMIN_ROOT = '.vitamin'
export const VITAMIN_HOME = normalizePath(process.env['VITAMIN_HOME'] || `${homedir()}/${VITAMIN_ROOT}`)
export const VITAMIN_PROJECT_ROOT = normalizePath(process.env['VITAMIN_PROJECT_ROOT'] || `${process.cwd()}/${VITAMIN_ROOT}`)
export const LOG_FILE = normalizePath(process.env['VITAMIN_LOG_FILE'] ?? '/tmp/vitamin.log')
export const TOOLS_SEARCH_MAX_OUTPUT_LINES = normalizeEnv(process.env['TOOLS_SEARCH_MAX_OUTPUT_LINES'], 500)
export const TOOLS_LS_MAX_ENTRIES = normalizeEnv(process.env['TOOLS_LS_MAX_ENTRIES'], 500)
export const TOOLS_MAX_OUTPUT_LINES = normalizeEnv(process.env['TOOLS_MAX_OUTPUT_LINES'], 2000)
export const TOOLS_MAX_OUTPUT_BYTES = normalizeEnv(process.env['TOOLS_MAX_OUTPUT_BYTES'], 60 * 1024)
export const TOOLS_EXECUTE_TIMEOUT = normalizeEnv(process.env['TOOLS_EXECUTE_TIMEOUT'], 30_000)
export const TOOLS_BINARY_DOWNLOAD_TIMEOUT = normalizeEnv(process.env['TOOLS_BINARY_DOWNLOAD_TIMEOUT'], 10_000)
export const AGENT_TOOLS_MAX_TURNS = normalizeEnv(process.env['AGENT_TOOLS_MAX_TURNS'], 25)
export const OFFLINE_MODE_ENABLED = process.env['PI_OFFLINE'] === '1' || process.env['PI_OFFLINE']?.toLowerCase() === 'true' || process.env['VITAMIN_OFFLINE']?.toLowerCase() === 'yes'

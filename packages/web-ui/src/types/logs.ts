export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LogEntry {
  id: number
  timestamp: string
  level: LogLevel
  module: string
  message: string
  data?: Record<string, unknown>
}

export const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
}

export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  trace: 'text-zinc-500',
  debug: 'text-zinc-400',
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  fatal: 'text-red-600 font-bold',
}

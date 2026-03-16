// 基于 pino 的结构化日志
// JSON Lines 输出到 /tmp/vitamin.log，控制台输出优先使用 pino-pretty（可选）
import { createRequire } from 'node:module'
import { PassThrough } from 'node:stream'
import pino from 'pino'

import { LOG_FILE } from './env'
import { TypedEventEmitter } from './event-emitter'
const require = createRequire(import.meta.url)

const DEFAULT_LEVEL = process.env.VITAMIN_LOG_LEVEL ?? 'info'

function isPrettyAvailable(): boolean {
  try {
    require.resolve('pino-pretty')
    return true
  } catch {
    return false
  }
}

function createTransportTargets(): pino.TransportTargetOptions[] {
  const targets: pino.TransportTargetOptions[] = [{
    target: 'pino/file',
    options: { destination: LOG_FILE, mkdir: true },
    level: DEFAULT_LEVEL,
  }]

  if (isPrettyAvailable()) {
    targets.push({
      target: 'pino-pretty',
      options: { colorize: true },
      level: DEFAULT_LEVEL,
    })
  } else {
    // 无 pino-pretty 时退回标准输出
    targets.push({
      target: 'pino/file',
      options: { destination: 1 },
      level: DEFAULT_LEVEL,
    })
  }

  return targets
}

interface LogEvent {
  [event: string]: (...args: unknown[]) => void
}

const logPassThrough = new PassThrough()
const globalLogEventEmitter = new TypedEventEmitter<LogEvent>()

logPassThrough.on('data', (chunk) => {
  try {
    globalLogEventEmitter.emit('log', JSON.parse(chunk.toString()))
  } catch {
    console.warn('Failed to parse log chunk for listener:', chunk.toString())
  }
})

export function attachLogListener(callback: (log: unknown) => void) {
  globalLogEventEmitter.on('log', callback)
}

export function detachLogListener(callback: (log: unknown) => void) {
  globalLogEventEmitter.off('log', callback)
}

// 根日志器，同时写入文件（JSON）、控制台（美化格式）以及内存监听器
const root = pino({ level: DEFAULT_LEVEL }, pino.multistream([
  { level: DEFAULT_LEVEL as pino.Level, stream: logPassThrough },
  { level: DEFAULT_LEVEL as pino.Level, stream: pino.transport({ targets: createTransportTargets() }) }
]))

// 创建带有命名上下文的子日志器
export function createLogger(name: string): pino.Logger {
  return root.child({ name })
}

// 获取根日志器实例
export function getRootLogger(): pino.Logger {
  return root
}
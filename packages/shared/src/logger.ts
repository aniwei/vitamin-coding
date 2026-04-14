import pino from 'pino'
import invariant from '@vitamin/invariant'
import { LOG_FILE, LOG_LEVEL } from '@vitamin/env'
import { createRequire } from 'node:module'
import { PassThrough } from 'node:stream'
import { Subscription } from './subscrption'

export type { Logger } from 'pino'
export type LogLevel = pino.Level

export interface LoggerOptions {
  level: LogLevel
  destination: string
}

// ── Internals ────────────────────────────────────────────────────────────────

const VALID_LEVELS: ReadonlySet<string> = new Set<LogLevel>([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
])

function toLogLevel(value: string): LogLevel {
  return VALID_LEVELS.has(value) ? (value as LogLevel) : 'info'
}

const pinoRequire = createRequire(import.meta.url)

function isPrettyAvailable(): boolean {
  try {
    pinoRequire.resolve('pino-pretty')
    return true
  } catch {
    return false
  }
}

function createTransportTargets(
  destination: string,
  level: LogLevel,
): pino.TransportTargetOptions[] {
  const fileTarget: pino.TransportTargetOptions = {
    target: 'pino/file',
    options: { destination, mkdir: true },
    level,
  }

  let stdoutTarget: pino.TransportTargetOptions

  if (isPrettyAvailable()) {
    stdoutTarget = {
      target: 'pino-pretty',
      options: { colorize: true },
      level,
    }
  } else {
    stdoutTarget = {
      target: 'pino/file',
      options: { destination: 1 },
      level,
    }
  }

  return [fileTarget, stdoutTarget]
}

const logPassThrough = new PassThrough()
const globalSubscription = new Subscription()

logPassThrough.on('data', (chunk) => {
  try {
    globalSubscription.publish({
      log: [JSON.parse(chunk.toString())],
    })
  } catch (error) {
    console.warn('Failed to parse log chunk for listener:', chunk.toString(), error)
  }
})

export function attachLogListener(callback: (log: unknown) => void) {
  return globalSubscription.subscribe('log', callback)
}

let root: pino.Logger | null = null
let rootLevel: LogLevel = toLogLevel(LOG_LEVEL)

export function ensureLogger(level: LogLevel, destination: string): pino.Logger {
  root ??= pino(
    { level },
    pino.multistream([
      { level, stream: logPassThrough },
      { level, stream: pino.transport({ targets: createTransportTargets(destination, level) }) },
    ]),
  )

  rootLevel = toLogLevel(root.level)
  return root
}

export function createLogger(name: string, options?: LoggerOptions): pino.Logger {
  ensureLogger(options?.level ?? toLogLevel(LOG_LEVEL), options?.destination ?? LOG_FILE)
  invariant(root, 'Root logger is not initialized')

  return root.child(
    { name },
    {
      level: options?.level ?? rootLevel,
    },
  )
}

export function getRootLogger(): pino.Logger {
  invariant(root, 'Root logger is not initialized')
  return root
}

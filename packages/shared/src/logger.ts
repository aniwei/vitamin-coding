import pino from 'pino'
import invariant from '@vitamin/invariant'
import { LOG_FILE, LOG_LEVEL } from '@vitamin/env'
import { createRequire } from 'node:module'
import { PassThrough } from 'node:stream'
import { Subscription } from './subscrption'

export type { Logger } from 'pino'

const require = createRequire(import.meta.url)

function isPrettyAvailable(): boolean {
  try {
    require.resolve('pino-pretty')
    return true
  } catch {
    return false
  }
}

function createTransportTargets(
  destination: string,
  level: string = 'info',
): pino.TransportTargetOptions[] {
  const targets: pino.TransportTargetOptions[] = [
    {
      target: 'pino/file',
      options: { destination, mkdir: true },
      level,
    },
  ]

  if (isPrettyAvailable()) {
    targets.push({
      target: 'pino-pretty',
      options: { colorize: true },
      level,
    })
  } else {
    // 无 pino-pretty 时退回标准输出
    targets.push({
      target: 'pino/file',
      options: { destination: 1 },
      level,
    })
  }

  return targets
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

export function ensureLogger(level: string, destination: string): pino.Logger {
  root ??= pino(
    { level },
    pino.multistream([
      { level: level as pino.Level, stream: logPassThrough },
      {
        level: level as pino.Level,
        stream: pino.transport({ targets: createTransportTargets(destination, level) }),
      },
    ]),
  )

  return root
}

interface LoggerOptions {
  level: 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'fatal'
  destination: string
}

export function createLogger(name: string, options?: LoggerOptions): pino.Logger {
  ensureLogger(options?.level ?? LOG_LEVEL, options?.destination ?? LOG_FILE)

  invariant(root, `Root logger is not initialized`)
  return root.child(
    { name },
    {
      level: options?.level ?? LOG_LEVEL,
    },
  )
}

export function getRootLogger(): pino.Logger {
  invariant(root, `Root logger is not initialized`)
  return root
}

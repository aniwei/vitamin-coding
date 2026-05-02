import pino from 'pino'
import invariant from '@x-mars/invariant'
import { LOG_FILE, LOG_LEVEL } from '@x-mars/env'
import { createRequire } from 'node:module'
import { PassThrough } from 'node:stream'
import { Subscription } from './subscrption'

export type { Logger } from 'pino'
export type LogLevel = pino.Level

export interface LoggerOptions {
  level: LogLevel
  destination: string
}

export interface PluginLogSinkContribution {
  name: string
  kind?: 'memory' | 'devtools' | 'custom'
  permissions?: Array<'network' | 'filesystem'>
}

export interface PluginLogFormatterContribution {
  name: string
  mediaType?: string
}

export interface PluginLogViewerContribution {
  name: string
  title: string
}

export interface PluginLogContribution {
  sinks?: PluginLogSinkContribution[]
  formatters?: PluginLogFormatterContribution[]
  viewers?: PluginLogViewerContribution[]
}

export interface PluginLogSinkEntry {
  pluginId: string
  sinkName: string
  event: unknown
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
const pluginLogContributions = new Map<
  string,
  { contribution: PluginLogContribution; entries: PluginLogSinkEntry[] }
>()

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

export function registerPluginLogContribution(
  contribution: PluginLogContribution,
  pluginId: string,
): void {
  pluginLogContributions.set(pluginId, {
    contribution: cloneLogContribution(contribution),
    entries: [],
  })
}

export function unregisterPluginLogContribution(pluginId: string): void {
  pluginLogContributions.delete(pluginId)
}

export function listPluginLogContributions(): Array<{
  pluginId: string
  contribution: PluginLogContribution
}> {
  return [...pluginLogContributions.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([pluginId, item]) => ({
      pluginId,
      contribution: cloneLogContribution(item.contribution),
    }))
}

export function getPluginLogSinkEntries(pluginId?: string): PluginLogSinkEntry[] {
  const entries: PluginLogSinkEntry[] = []
  for (const [id, item] of pluginLogContributions) {
    if (pluginId && id !== pluginId) {
      continue
    }
    entries.push(...item.entries.map((entry) => ({ ...entry })))
  }
  return entries
}

export function redactLogValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactLogValue(item))
  }
  if (!value || typeof value !== 'object') {
    return value
  }

  const redacted: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveLogKey(key)) {
      redacted[key] = '[REDACTED]'
    } else {
      redacted[key] = redactLogValue(child)
    }
  }
  return redacted
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

globalSubscription.subscribe('log', (event) => {
  if (pluginLogContributions.size === 0) {
    return
  }
  const redacted = redactLogValue(event)
  for (const [pluginId, item] of pluginLogContributions) {
    for (const sink of item.contribution.sinks ?? []) {
      item.entries.push({ pluginId, sinkName: sink.name, event: redacted })
    }
    if (item.entries.length > 1000) {
      item.entries.splice(0, item.entries.length - 1000)
    }
  }
})

function cloneLogContribution(contribution: PluginLogContribution): PluginLogContribution {
  return {
    sinks: contribution.sinks?.map((sink) => ({
      ...sink,
      permissions: sink.permissions ? [...sink.permissions] : undefined,
    })),
    formatters: contribution.formatters?.map((formatter) => ({ ...formatter })),
    viewers: contribution.viewers?.map((viewer) => ({ ...viewer })),
  }
}

function isSensitiveLogKey(key: string): boolean {
  return /token|secret|password|authorization|api[_-]?key/i.test(key)
}

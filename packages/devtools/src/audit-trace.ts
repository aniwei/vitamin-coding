import type { DebugSnapshot } from './protocol'

export type AuditTraceEventType =
  | 'debug.snapshot'
  | 'tool.execution'
  | 'permission.decision'
  | 'model.response'

export interface AuditTraceEvent {
  seq: number
  timestamp: number
  type: AuditTraceEventType
  sessionId?: string
  payload: Record<string, unknown>
}

export interface AuditTrace {
  version: 1
  id: string
  createdAt: number
  events: AuditTraceEvent[]
  metadata: Record<string, unknown>
}

export interface AuditTraceReplayExpectation {
  eventTypes?: AuditTraceEventType[]
  minEvents?: number
  permissionEffects?: Array<'allow' | 'deny' | 'ask'>
  toolNames?: string[]
}

export interface AuditTraceReplayResult {
  ok: boolean
  failures: string[]
  summary: {
    events: number
    byType: Record<AuditTraceEventType, number>
    permissionEffects: Record<string, number>
    toolNames: string[]
  }
}

export interface AuditTraceRecorderOptions {
  id?: string
  clock?: () => number
  maxEvents?: number
  metadata?: Record<string, unknown>
  redactKeys?: string[]
}

const DEFAULT_REDACT_KEYS = ['authorization', 'apiKey', 'api_key', 'password', 'secret', 'token']

export class AuditTraceRecorder {
  private readonly id: string
  private readonly clock: () => number
  private readonly maxEvents: number
  private readonly metadata: Record<string, unknown>
  private readonly redactKeys: string[]
  private readonly createdAt: number
  private events: AuditTraceEvent[] = []
  private seq = 0

  constructor(options: AuditTraceRecorderOptions = {}) {
    this.id = options.id ?? `trace_${Math.random().toString(36).slice(2, 10)}`
    this.clock = options.clock ?? Date.now
    this.maxEvents = options.maxEvents ?? 1000
    this.metadata = sanitizeRecord(
      options.metadata ?? {},
      options.redactKeys ?? DEFAULT_REDACT_KEYS,
    )
    this.redactKeys = options.redactKeys ?? DEFAULT_REDACT_KEYS
    this.createdAt = this.clock()
  }

  recordSnapshot(snapshot: DebugSnapshot, sessionId?: string): AuditTraceEvent {
    return this.record('debug.snapshot', snapshot as unknown as Record<string, unknown>, sessionId)
  }

  recordToolExecution(event: Record<string, unknown>, sessionId?: string): AuditTraceEvent {
    return this.record('tool.execution', event, sessionId)
  }

  recordPermissionDecision(entry: Record<string, unknown>, sessionId?: string): AuditTraceEvent {
    return this.record('permission.decision', entry, sessionId)
  }

  recordModelResponse(response: Record<string, unknown>, sessionId?: string): AuditTraceEvent {
    return this.record('model.response', response, sessionId)
  }

  export(): AuditTrace {
    return {
      version: 1,
      id: this.id,
      createdAt: this.createdAt,
      metadata: { ...this.metadata },
      events: this.events.map((event) => ({
        ...event,
        payload: { ...event.payload },
      })),
    }
  }

  clear(): void {
    this.events = []
    this.seq = 0
  }

  private record(
    type: AuditTraceEventType,
    payload: Record<string, unknown>,
    sessionId?: string,
  ): AuditTraceEvent {
    const event: AuditTraceEvent = {
      seq: ++this.seq,
      timestamp: this.clock(),
      type,
      sessionId,
      payload: sanitizeRecord(payload, this.redactKeys),
    }

    this.events.push(event)
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents)
    }
    return event
  }
}

export function replayAuditTrace(
  trace: AuditTrace,
  expectation: AuditTraceReplayExpectation = {},
): AuditTraceReplayResult {
  const failures: string[] = []
  const summary = summarizeTrace(trace)

  if (trace.version !== 1) {
    failures.push(`Unsupported trace version: ${trace.version}`)
  }

  if (expectation.minEvents !== undefined && trace.events.length < expectation.minEvents) {
    failures.push(`Expected at least ${expectation.minEvents} events, got ${trace.events.length}`)
  }

  for (let index = 1; index < trace.events.length; index += 1) {
    const current = trace.events[index]
    const previous = trace.events[index - 1]
    if (!current || !previous) {
      continue
    }
    if (current.seq <= previous.seq) {
      failures.push(`Event sequence is not strictly increasing at index ${index}`)
      break
    }
  }

  for (const type of expectation.eventTypes ?? []) {
    if (summary.byType[type] === 0) {
      failures.push(`Missing event type: ${type}`)
    }
  }

  for (const effect of expectation.permissionEffects ?? []) {
    if ((summary.permissionEffects[effect] ?? 0) === 0) {
      failures.push(`Missing permission effect: ${effect}`)
    }
  }

  for (const toolName of expectation.toolNames ?? []) {
    if (!summary.toolNames.includes(toolName)) {
      failures.push(`Missing tool execution: ${toolName}`)
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    summary,
  }
}

function summarizeTrace(trace: AuditTrace): AuditTraceReplayResult['summary'] {
  const byType: Record<AuditTraceEventType, number> = {
    'debug.snapshot': 0,
    'tool.execution': 0,
    'permission.decision': 0,
    'model.response': 0,
  }
  const permissionEffects: Record<string, number> = {}
  const toolNames = new Set<string>()

  for (const event of trace.events) {
    byType[event.type] += 1

    if (event.type === 'permission.decision') {
      const decision = readRecord(event.payload.decision)
      const effect = decision ? decision.effect : event.payload.effect
      if (typeof effect === 'string') {
        permissionEffects[effect] = (permissionEffects[effect] ?? 0) + 1
      }
    }

    if (event.type === 'tool.execution') {
      const toolName = event.payload.toolName
      if (typeof toolName === 'string') {
        toolNames.add(toolName)
      }
    }
  }

  return {
    events: trace.events.length,
    byType,
    permissionEffects,
    toolNames: [...toolNames].sort(),
  }
}

function sanitizeRecord(
  value: Record<string, unknown>,
  redactKeys: string[],
): Record<string, unknown> {
  return sanitizeValue(value, redactKeys) as Record<string, unknown>
}

function sanitizeValue(value: unknown, redactKeys: string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, redactKeys))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const output: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = shouldRedact(key, redactKeys) ? '[REDACTED]' : sanitizeValue(entry, redactKeys)
  }
  return output
}

function shouldRedact(key: string, redactKeys: string[]): boolean {
  const normalized = key.toLowerCase()
  return redactKeys.some((redactKey) => normalized === redactKey.toLowerCase())
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, unknown>
}

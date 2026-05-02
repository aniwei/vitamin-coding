import type {
  PermissionContext,
  PermissionDecision,
  PermissionAuditEntry,
  RuleEffect,
} from './types'
import { redactLogValue } from '@vitamin/shared'

export class PermissionAuditLog {
  private entries: PermissionAuditEntry[] = []
  private listeners: Array<(entry: PermissionAuditEntry) => void> = []
  private readonly maxEntries: number

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries
  }

  record(context: PermissionContext, decision: PermissionDecision): void {
    const entry: PermissionAuditEntry = {
      timestamp: decision.timestamp,
      sessionId: context.sessionId,
      agentName: context.agentName,
      toolName: context.toolName,
      filePath: context.filePath,
      metadata: { ...context.metadata },
      decision,
    }

    this.entries.push(entry)
    for (const listener of this.listeners) {
      listener(redactPermissionAuditEntry(entry))
    }

    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries)
    }
  }

  getEntries(filter?: { sessionId?: string; effect?: RuleEffect }): PermissionAuditEntry[] {
    let result = this.entries
    if (filter?.sessionId) {
      result = result.filter((e) => e.sessionId === filter.sessionId)
    }
    if (filter?.effect) {
      result = result.filter((e) => e.decision.effect === filter.effect)
    }
    return result
  }

  getRedactedEntries(filter?: { sessionId?: string; effect?: RuleEffect }): PermissionAuditEntry[] {
    return this.getEntries(filter).map((entry) => redactPermissionAuditEntry(entry))
  }

  getDenyCount(sessionId?: string): number {
    return this.getEntries({ sessionId, effect: 'deny' }).length
  }

  getAskCount(sessionId?: string): number {
    return this.getEntries({ sessionId, effect: 'ask' }).length
  }

  clear(sessionId?: string): void {
    if (sessionId) {
      this.entries = this.entries.filter((e) => e.sessionId !== sessionId)
    } else {
      this.entries = []
    }
  }

  onRecord(listener: (entry: PermissionAuditEntry) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((item) => item !== listener)
    }
  }

  get size(): number {
    return this.entries.length
  }
}

function redactPermissionAuditEntry(entry: PermissionAuditEntry): PermissionAuditEntry {
  return {
    ...entry,
    metadata: entry.metadata
      ? (redactLogValue(entry.metadata) as Record<string, unknown>)
      : undefined,
    decision: { ...entry.decision },
  }
}

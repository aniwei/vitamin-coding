// 权限审计日志 — 内存 ring buffer
import type {
  PermissionContext,
  PermissionDecision,
  PermissionAuditEntry,
  RuleEffect,
} from './types'

export class PermissionAuditLog {
  private entries: PermissionAuditEntry[] = []
  private readonly maxEntries: number

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries
  }

  record(context: PermissionContext, decision: PermissionDecision): void {
    this.entries.push({
      timestamp: decision.timestamp,
      sessionId: context.sessionId,
      agentName: context.agentName,
      toolName: context.toolName,
      filePath: context.filePath,
      decision,
    })

    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries)
    }
  }

  getEntries(filter?: { sessionId?: string; effect?: RuleEffect }): PermissionAuditEntry[] {
    let result = this.entries
    if (filter?.sessionId) result = result.filter(e => e.sessionId === filter.sessionId)
    if (filter?.effect) result = result.filter(e => e.decision.effect === filter.effect)
    return result
  }

  getDenyCount(sessionId?: string): number {
    return this.getEntries({ sessionId, effect: 'deny' }).length
  }

  getAskCount(sessionId?: string): number {
    return this.getEntries({ sessionId, effect: 'ask' }).length
  }

  clear(sessionId?: string): void {
    if (sessionId) {
      this.entries = this.entries.filter(e => e.sessionId !== sessionId)
    } else {
      this.entries = []
    }
  }

  get size(): number {
    return this.entries.length
  }
}

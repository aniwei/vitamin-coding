// Compaction Logger Hook — 压缩事件日志记录
import { createLogger } from '@vitamin/shared'
import type { HookRegistration } from '../../types'

const log = createLogger('@vitamin/hooks:compaction')

// 每 session 的压缩统计
const compactionStats = new Map<string, CompactionStats>()

interface CompactionStats {
  compactionCount: number
  totalCompacted: number
  lastCompactionTime: number
}

export function createCompactionLoggerHook(): HookRegistration<'compaction.before'> {
  return {
    name: 'compaction-logger',
    timing: 'compaction.before',
    priority: 10,
    enabled: true,
    handler(input: { sessionId: string; messageCount: number }): void {
      const stats = compactionStats.get(input.sessionId) ?? {
        compactionCount: 0,
        totalCompacted: 0,
        lastCompactionTime: 0,
      }

      stats.compactionCount++
      stats.lastCompactionTime = Date.now()
      compactionStats.set(input.sessionId, stats)

      log.info(
        'Compaction started: session=%s messageCount=%d compaction#%d',
        input.sessionId,
        input.messageCount,
        stats.compactionCount,
      )
    },
  }
}

export function createCompactionAfterHook(): HookRegistration<'compaction.after'> {
  return {
    name: 'compaction-after-logger',
    timing: 'compaction.after',
    priority: 10,
    enabled: true,
    handler(input: { sessionId: string; retainedCount: number }): void {
      const stats = compactionStats.get(input.sessionId)
      if (stats) {
        const duration = Date.now() - stats.lastCompactionTime
        stats.totalCompacted += input.retainedCount
        log.info(
          'Compaction finished: session=%s retained=%d duration=%dms totalCompactions=%d',
          input.sessionId,
          input.retainedCount,
          duration,
          stats.compactionCount,
        )
      }
    },
  }
}

export function getCompactionStats(sessionId: string): CompactionStats | undefined {
  return compactionStats.get(sessionId)
}

export function clearCompactionStats(sessionId: string): void {
  compactionStats.delete(sessionId)
}

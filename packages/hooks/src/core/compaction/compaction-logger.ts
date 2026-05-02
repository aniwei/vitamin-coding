import { createLogger } from '@x-mars/shared'
import { defineHook } from '../../hook-spec'
import type { HookSpec } from '../../hook-spec'

const logger = createLogger('@x-mars/hooks:compaction')

// 每 session 的压缩统计
const compactionStats = new Map<string, CompactionStats>()

interface CompactionStats {
  compactionCount: number
  totalCompacted: number
  lastCompactionTime: number
}

export function createCompactionLoggerHook(): HookSpec {
  return defineHook({
    name: 'compaction-logger',
    timing: 'compaction.before',
    priority: 10,
    handle(input) {
      const stats = compactionStats.get(input.sessionId) ?? {
        compactionCount: 0,
        totalCompacted: 0,
        lastCompactionTime: 0,
      }

      stats.compactionCount++
      stats.lastCompactionTime = Date.now()
      compactionStats.set(input.sessionId, stats)

      logger.info(
        'Compaction started: session=%s messageCount=%d compaction#%d',
        input.sessionId,
        input.messageCount,
        stats.compactionCount,
      )
    },
  })
}

export function createCompactionAfterHook(): HookSpec {
  return defineHook({
    name: 'compaction-after-logger',
    timing: 'compaction.after',
    priority: 10,
    handle(input) {
      const stats = compactionStats.get(input.sessionId)
      if (stats) {
        const duration = Date.now() - stats.lastCompactionTime
        stats.totalCompacted += input.retainedCount
        logger.info(
          'Compaction finished: session=%s retained=%d duration=%dms totalCompactions=%d',
          input.sessionId,
          input.retainedCount,
          duration,
          stats.compactionCount,
        )
      }
    },
  })
}

export function getCompactionStats(sessionId: string): CompactionStats | undefined {
  return compactionStats.get(sessionId)
}

export function clearCompactionStats(sessionId: string): void {
  compactionStats.delete(sessionId)
}

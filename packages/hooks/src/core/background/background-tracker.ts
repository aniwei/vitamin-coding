// Background Tracker Hook — 后台任务生命周期追踪
import { createLogger } from '@vitamin/shared'
import type { HookRegistration } from '../../types'

const log = createLogger('@vitamin/hooks:background-tracker')

interface BackgroundTaskRecord {
  taskId: string
  agentName: string
  startTime: number
  endTime?: number
  success?: boolean
  durationMs?: number
}

// 活跃后台任务 + 历史
const activeTasks = new Map<string, BackgroundTaskRecord>()
const completedTasks: BackgroundTaskRecord[] = []
const MAX_COMPLETED_HISTORY = 100

export function createBackgroundStartHook(): HookRegistration<'background.start'> {
  return {
    name: 'background-start-tracker',
    timing: 'background.start',
    priority: 10,
    enabled: true,
    handle(input: { taskId: string; agentName: string }): void {
      activeTasks.set(input.taskId, {
        taskId: input.taskId,
        agentName: input.agentName,
        startTime: Date.now(),
      })
      log.debug('Background task started: taskId=%s agent=%s', input.taskId, input.agentName)
    },
  }
}

export function createBackgroundEndHook(): HookRegistration<'background.end'> {
  return {
    name: 'background-end-tracker',
    timing: 'background.end',
    priority: 10,
    enabled: true,
    handle(input: { taskId: string; agentName: string; success: boolean }): void {
      const record = activeTasks.get(input.taskId)
      if (record) {
        record.endTime = Date.now()
        record.success = input.success
        record.durationMs = record.endTime - record.startTime

        activeTasks.delete(input.taskId)
        completedTasks.push(record)

        // 保持历史窗口
        if (completedTasks.length > MAX_COMPLETED_HISTORY) {
          completedTasks.splice(0, completedTasks.length - MAX_COMPLETED_HISTORY)
        }

        log.debug(
          'Background task ended: taskId=%s agent=%s success=%s duration=%dms',
          input.taskId,
          input.agentName,
          input.success,
          record.durationMs,
        )
      }
    },
  }
}

export function getActiveBackgroundTasks(): ReadonlyMap<string, BackgroundTaskRecord> {
  return activeTasks
}

export function getCompletedBackgroundTasks(): ReadonlyArray<BackgroundTaskRecord> {
  return completedTasks
}

export function clearBackgroundTaskHistory(): void {
  activeTasks.clear()
  completedTasks.length = 0
}

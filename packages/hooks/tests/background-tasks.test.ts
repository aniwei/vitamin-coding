import { describe, expect, it } from 'vitest'
import {
  createBackgroundStartHook,
  createBackgroundEndHook,
  getActiveBackgroundTasks,
  getCompletedBackgroundTasks,
  clearBackgroundTaskHistory,
} from '../src/index'

describe('Background task tracker hooks', () => {
  // Clear state before tests
  it('#clearBackgroundTaskHistory resets all state', () => {
    clearBackgroundTaskHistory()
    expect(getActiveBackgroundTasks().size).toBe(0)
    expect(getCompletedBackgroundTasks().length).toBe(0)
  })

  it('#createBackgroundStartHook records active task', () => {
    clearBackgroundTaskHistory()
    const hook = createBackgroundStartHook()

    hook.handle(
      { taskId: 'task-1', agentName: 'worker-a' },
      undefined as never,
    )

    const active = getActiveBackgroundTasks()
    expect(active.size).toBe(1)
    expect(active.get('task-1')!.agentName).toBe('worker-a')
    expect(active.get('task-1')!.startTime).toBeGreaterThan(0)
  })

  it('#createBackgroundEndHook moves task to completed', () => {
    clearBackgroundTaskHistory()
    const startHook = createBackgroundStartHook()
    const endHook = createBackgroundEndHook()

    startHook.handle(
      { taskId: 'task-2', agentName: 'worker-b' },
      undefined as never,
    )

    endHook.handle(
      { taskId: 'task-2', agentName: 'worker-b', success: true },
      undefined as never,
    )

    expect(getActiveBackgroundTasks().size).toBe(0)
    const completed = getCompletedBackgroundTasks()
    expect(completed.length).toBe(1)
    expect(completed[0]!.taskId).toBe('task-2')
    expect(completed[0]!.success).toBe(true)
    expect(completed[0]!.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('#records failed tasks correctly', () => {
    clearBackgroundTaskHistory()
    const startHook = createBackgroundStartHook()
    const endHook = createBackgroundEndHook()

    startHook.handle(
      { taskId: 'task-3', agentName: 'worker-c' },
      undefined as never,
    )

    endHook.handle(
      { taskId: 'task-3', agentName: 'worker-c', success: false },
      undefined as never,
    )

    const completed = getCompletedBackgroundTasks()
    expect(completed[0]!.success).toBe(false)
  })

  it('#hook metadata is correct', () => {
    const start = createBackgroundStartHook()
    const end = createBackgroundEndHook()

    expect(start.name).toBe('background-start-tracker')
    expect(start.timing).toBe('background.start')
    expect(end.name).toBe('background-end-tracker')
    expect(end.timing).toBe('background.end')
  })
})

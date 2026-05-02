// @x-mars/orchestrator — 后台任务管理

import type { TaskStore } from './task-store'

export class BackgroundManager {
  constructor(
    private readonly taskStore: TaskStore,
    private readonly abortTask?: (taskId: string) => void,
  ) {}

  async getOutput(id: string): Promise<{
    status: string
    success: boolean
    output?: string
    error?: string
  }> {
    const task = await this.taskStore.get(id)
    if (!task) {
      return {
        status: 'not_found',
        success: false,
        error: `Task not found id: ${id}`,
      }
    }

    if (task.status === 'completed') {
      return {
        status: 'completed',
        success: true,
        output: task.output?.text,
      }
    }

    if (task.status === 'failed') {
      return {
        status: 'failed',
        success: false,
        error: task.error?.message ?? 'Task failed',
      }
    }

    return { status: task.status, success: true }
  }

  async cancel(id: string): Promise<{ success: boolean; error?: string }> {
    const task = await this.taskStore.get(id)

    if (!task) {
      return {
        success: false,
        error: `Task not found id: ${id}`,
      }
    }

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return {
        success: false,
        error: `Task already in terminal state: ${task.status}, id: ${id}`,
      }
    }

    await this.taskStore.update(id, {
      status: 'cancelled',
      completedAt: Date.now(),
    })

    if (this.abortTask) {
      this.abortTask(id)
    }

    return { success: true }
  }
}

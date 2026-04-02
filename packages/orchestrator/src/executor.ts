import type { HookRegistry } from '@vitamin/hooks'
import type { TaskInput, TaskOutput } from './types'
import type { TaskStore } from './task-store'
import type { RetryPolicy, CircuitBreaker } from './retry'

export interface RunSessionOptions {
  prompt: string
  sessionId?: string
  sessionMode: 'ephemeral' | 'sticky'
  agentName?: string
  slot?: TaskInput['slot']
}

export interface RunSessionResult {
  text: string
  sessionId: string
  tokenUsage?: { input: number; output: number; cacheRead: number }
  durationMs: number
}

export class TaskExecutor {
  constructor(
    private readonly taskStore: TaskStore,
    private readonly hookRegistry: HookRegistry,
    private readonly retryPolicy: RetryPolicy,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly runSession: (options: RunSessionOptions) => Promise<RunSessionResult>,
    private readonly maxActiveTasks: number,
  ) {}

  async dispatch(args: {
    prompt?: string
    planId?: string
    taskId?: string
    subagent?: string
    category?: string
    mode: 'sync' | 'background'
    sessionId?: string
    sessionMode?: 'ephemeral' | 'sticky'
    slot?: TaskInput['slot']
  }): Promise<{
    success: boolean
    output?: string
    id?: string
    status?: string
    error?: string
  }> {
    // 并发度检查
    const running = await this.taskStore.list({ status: 'running' })
    if (running.length >= this.maxActiveTasks) {
      return {
        success: false,
        error: `Max active tasks reached (${this.maxActiveTasks}). Wait for running tasks to complete.`,
      }
    }

    // 熔断器检查
    if (this.circuitBreaker.isOpen()) {
      return {
        success: false,
        error: 'Circuit breaker is open due to repeated failures. Try again later.',
      }
    }

    // 创建 Task 记录
    const task = await this.taskStore.create({
      prompt: args.prompt ?? '',
      subagent: args.subagent,
      category: args.category,
      planId: args.planId,
      taskId: args.taskId,
      sessionId: args.sessionId,
      sessionMode: args.sessionMode ?? 'ephemeral',
      mode: args.mode,
      slot: args.slot,
    })

    await this.hookRegistry.emit('task.created', { 
      task: { ...task } as unknown as Record<string, unknown> 
    })

    // 后台模式：不等待完成
    if (args.mode === 'background') {
      void this.executeTask(task.id)
      return {
        success: true,
        id: task.id,
        status: 'pending',
        output: `Background task created: ${task.id}`,
      }
    }

    // 同步模式：等待完成
    return this.executeTask(task.id)
  }

  async callAgent(
    agent: string,
    prompt: string,
    options?: { slot?: TaskInput['slot'] },
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      const result = await this.runSession({
        prompt,
        sessionMode: 'ephemeral',
        agentName: agent,
        slot: options?.slot,
      })

      return { success: true, output: result.text }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private async executeTask(taskId: string): Promise<{
    success: boolean
    output?: string
    id?: string
    status?: string
    error?: string
  }> {
    const task = await this.taskStore.get(taskId)
    if (!task) {
      return { success: false, error: `Task not found: ${taskId}` }
    }

    await this.taskStore.update(taskId, { status: 'running', attempts: task.attempts + 1 })
    await this.hookRegistry.emit('task.started', {
      task: { ...task, status: 'running' } as unknown as Record<string, unknown>,
      agent: task.input.subagent ?? 'default',
    })

    try {
      const result = await this.runSession({
        prompt: task.input.prompt,
        sessionId: task.input.sessionId,
        sessionMode: task.sessionPolicy,
        agentName: task.input.subagent,
        slot: task.input.slot,
      })

      const output: TaskOutput = {
        text: result.text,
        tokenUsage: result.tokenUsage,
        durationMs: result.durationMs,
      }

      await this.taskStore.update(taskId, {
        status: 'completed',
        output,
        sessionId: result.sessionId,
        completedAt: Date.now(),
      })

      this.circuitBreaker.success()

      await this.hookRegistry.emit('task.completed', {
        task: { ...task, status: 'completed', output } as unknown as Record<string, unknown>,
        result: output as unknown as Record<string, unknown>,
      })

      return {
        success: true,
        output: result.text,
        id: taskId,
        status: 'completed',
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)

      // 检查是否可重试
      const canRetry = this.retryPolicy.shouldRetry(task.attempts + 1)
      if (canRetry) {
        const backoff = this.retryPolicy.getBackoff(task.attempts + 1)
        await sleep(backoff)
        return this.executeTask(taskId)
      }

      this.circuitBreaker.failure()

      const taskError = {
        code: 'EXECUTION_FAILED',
        message: errMsg,
        retriable: false,
      }

      await this.taskStore.update(taskId, {
        status: 'failed',
        error: taskError,
        completedAt: Date.now(),
      })

      await this.hookRegistry.emit('task.failed', {
        task: { ...task, status: 'failed' } as unknown as Record<string, unknown>,
        error: taskError as unknown as Record<string, unknown>,
      })

      return {
        success: false,
        error: errMsg,
        id: taskId,
        status: 'failed',
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

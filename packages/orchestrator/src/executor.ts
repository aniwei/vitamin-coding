import type { HookRegistry } from '@x-mars/hooks'
import { sleep, withTimeout } from '@x-mars/shared'
import type { SidechainContext, SidechainPolicy, Task, TaskInput, TaskOutput } from './types'
import type { TaskStore } from './task-store'
import type { RetryPolicy, CircuitBreaker } from './retry'

export interface RunSessionOptions {
  prompt: string
  sessionId?: string
  sessionMode: 'ephemeral' | 'sticky'
  agentName?: string
  slot?: TaskInput['slot']
  signal?: AbortSignal
  sidechain?: {
    taskId?: string
    parentTaskId?: string
    parentSessionId?: string
    subagent?: string
    category?: string
    policy: SidechainPolicy
  }
  promptContext?: {
    taskTitle?: string
    taskDescription?: string
    taskFiles?: string[]
  }
}

export interface RunSessionResult {
  text: string
  sessionId: string
  tokenUsage?: { input: number; output: number; cacheRead: number }
  durationMs: number
  summary?: string
  transcript?: unknown[]
}

const DEFAULT_SIDECHAIN_POLICY: SidechainPolicy = {
  returnMode: 'summary_only',
  permissionMode: 'inherit',
}

const TIMEOUT_ERROR_CODE = 'EXECUTION_TIMEOUT'

export class TaskExecutor {
  private readonly activeControllers = new Map<string, AbortController>()

  constructor(
    private readonly taskStore: TaskStore,
    private readonly hookRegistry: HookRegistry,
    private readonly retryPolicy: RetryPolicy,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly runSession: (options: RunSessionOptions) => Promise<RunSessionResult>,
    private readonly maxActiveTasks: number,
  ) {}

  async dispatch(args: {
    prompt: string
    subagent?: string
    category?: string
    mode: 'sync' | 'background'
    sessionId?: string
    sessionMode?: 'ephemeral' | 'sticky'
    slot?: TaskInput['slot']
    parentTaskId?: string
    parentSessionId?: string
    sidechain?: Partial<SidechainPolicy>
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
      prompt: args.prompt,
      subagent: args.subagent,
      category: args.category,
      sessionId: args.sessionId,
      sessionMode: args.sessionMode ?? 'ephemeral',
      mode: args.mode,
      slot: args.slot,
      parentTaskId: args.parentTaskId,
      parentSessionId: args.parentSessionId,
      sidechain: args.sidechain,
    })

    await this.hookRegistry.emit('task.created', {
      task: { ...task } as unknown as Record<string, unknown>,
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

  cancelTask(taskId: string): boolean {
    const controller = this.activeControllers.get(taskId)
    if (!controller) {
      return false
    }
    controller.abort()
    return true
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

    const controller = new AbortController()
    this.activeControllers.set(taskId, controller)
    const sidechainPolicy = resolveSidechainPolicy(task.input.sidechain)
    let timedOut = false

    try {
      const result = await withTimeout(
        this.runSession({
          prompt: task.input.prompt,
          sessionId: task.input.sessionId,
          sessionMode: task.sessionPolicy,
          agentName: task.input.subagent,
          slot: task.input.slot,
          signal: controller.signal,
          sidechain: buildSidechainRunOptions(task.id, task.input),
        }),
        sidechainPolicy.timeoutMs,
        {
          onTimeout: () => {
            timedOut = true
            controller.abort()
          },
          createTimeoutError: (timeoutMs) => new TaskTimeoutError(timeoutMs),
        },
      )

      if (timedOut) {
        return this.finishTimedOutTask(task, sidechainPolicy)
      }
      if (controller.signal.aborted || (await this.isTaskCancelled(taskId))) {
        return this.finishCancelledTask(taskId)
      }

      const outputText =
        sidechainPolicy.returnMode === 'summary_only'
          ? (result.summary ?? summarizeText(result.text))
          : result.text
      const output: TaskOutput = {
        text: outputText,
        summary: result.summary,
        tokenUsage: result.tokenUsage,
        durationMs: result.durationMs,
      }
      const sidechain: SidechainContext = {
        isolated: true,
        parentTaskId: task.input.parentTaskId,
        parentSessionId: task.input.parentSessionId,
        childSessionId: result.sessionId,
        subagent: task.input.subagent,
        category: task.input.category,
        policy: sidechainPolicy,
        summary: result.summary ?? outputText,
        transcript: result.transcript,
      }

      await this.taskStore.update(taskId, {
        status: 'completed',
        output,
        sessionId: result.sessionId,
        sidechain,
        completedAt: Date.now(),
      })

      this.circuitBreaker.success()

      await this.hookRegistry.emit('task.completed', {
        task: { ...task, status: 'completed', output } as unknown as Record<string, unknown>,
        result: output as unknown as Record<string, unknown>,
      })

      return {
        success: true,
        output: outputText,
        id: taskId,
        status: 'completed',
      }
    } catch (error) {
      if (timedOut) {
        return this.finishTimedOutTask(task, sidechainPolicy, error)
      }
      if (controller.signal.aborted || (await this.isTaskCancelled(taskId))) {
        return this.finishCancelledTask(taskId)
      }

      const errMsg = error instanceof Error ? error.message : String(error)
      const sidechain: SidechainContext = {
        isolated: true,
        parentTaskId: task.input.parentTaskId,
        parentSessionId: task.input.parentSessionId,
        childSessionId: getErrorStringProperty(error, 'sidechainSessionId'),
        subagent: task.input.subagent,
        category: task.input.category,
        policy: sidechainPolicy,
        summary: `Sidechain task failed: ${errMsg}`,
        transcript: getErrorArrayProperty(error, 'sidechainTranscript'),
      }

      // 检查是否可重试
      const canRetry = this.retryPolicy.shouldRetry(task.attempts + 1)
      if (canRetry) {
        const backoff = this.retryPolicy.getBackoff(task.attempts + 1)
        await sleep(backoff, { signal: controller.signal }).catch(() => undefined)
        if (timedOut) {
          return this.finishTimedOutTask(task, sidechainPolicy)
        }
        if (controller.signal.aborted || (await this.isTaskCancelled(taskId))) {
          return this.finishCancelledTask(taskId)
        }
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
        sidechain,
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
    } finally {
      if (this.activeControllers.get(taskId) === controller) {
        this.activeControllers.delete(taskId)
      }
    }
  }

  private async isTaskCancelled(taskId: string): Promise<boolean> {
    const latest = await this.taskStore.get(taskId)
    return latest?.status === 'cancelled'
  }

  private async finishCancelledTask(taskId: string): Promise<{
    success: boolean
    output?: string
    id?: string
    status?: string
    error?: string
  }> {
    await this.taskStore.update(taskId, { status: 'cancelled', completedAt: Date.now() })
    return {
      success: false,
      id: taskId,
      status: 'cancelled',
      error: `Task cancelled: ${taskId}`,
    }
  }

  private async finishTimedOutTask(
    task: Task,
    sidechainPolicy: SidechainPolicy,
    error?: unknown,
  ): Promise<{
    success: boolean
    output?: string
    id?: string
    status?: string
    error?: string
  }> {
    const timeoutMs = sidechainPolicy.timeoutMs ?? 0
    const message = `Task timed out after ${timeoutMs}ms`
    const sidechain: SidechainContext = {
      isolated: true,
      parentTaskId: task.input.parentTaskId,
      parentSessionId: task.input.parentSessionId,
      childSessionId: getErrorStringProperty(error, 'sidechainSessionId'),
      subagent: task.input.subagent,
      category: task.input.category,
      policy: sidechainPolicy,
      summary: `Sidechain task timed out after ${timeoutMs}ms`,
      transcript: getErrorArrayProperty(error, 'sidechainTranscript'),
    }
    const taskError = {
      code: TIMEOUT_ERROR_CODE,
      message,
      retriable: false,
    }

    this.circuitBreaker.failure()

    await this.taskStore.update(task.id, {
      status: 'failed',
      error: taskError,
      sidechain,
      completedAt: Date.now(),
    })

    await this.hookRegistry.emit('task.failed', {
      task: { ...task, status: 'failed' } as unknown as Record<string, unknown>,
      error: taskError as unknown as Record<string, unknown>,
    })

    return {
      success: false,
      id: task.id,
      status: 'failed',
      error: message,
    }
  }
}

function buildSidechainRunOptions(
  taskId: string,
  input: TaskInput,
): NonNullable<RunSessionOptions['sidechain']> {
  return {
    taskId,
    parentTaskId: input.parentTaskId,
    parentSessionId: input.parentSessionId,
    subagent: input.subagent,
    category: input.category,
    policy: resolveSidechainPolicy(input.sidechain),
  }
}

function resolveSidechainPolicy(policy?: Partial<SidechainPolicy>): SidechainPolicy {
  const timeoutMs = normalizeTimeoutMs(policy?.timeoutMs)
  return {
    ...DEFAULT_SIDECHAIN_POLICY,
    ...policy,
    timeoutMs,
    allowedTools: policy?.allowedTools ? [...policy.allowedTools] : undefined,
    deniedTools: policy?.deniedTools ? [...policy.deniedTools] : undefined,
  }
}

function normalizeTimeoutMs(timeoutMs: number | undefined): number | undefined {
  if (timeoutMs === undefined || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return undefined
  }
  return Math.floor(timeoutMs)
}

class TaskTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Task timed out after ${timeoutMs}ms`)
    this.name = 'TaskTimeoutError'
  }
}

function summarizeText(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= 2000) {
    return trimmed
  }
  return `${trimmed.slice(0, 2000).trimEnd()}\n[truncated sidechain output]`
}

function getErrorStringProperty(error: unknown, key: string): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }
  const value = (error as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

function getErrorArrayProperty(error: unknown, key: string): unknown[] | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }
  const value = (error as Record<string, unknown>)[key]
  return Array.isArray(value) ? value : undefined
}

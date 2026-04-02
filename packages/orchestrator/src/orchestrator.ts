// @vitamin/orchestrator — Orchestrator 核心类

import type { HookRegistry } from '@vitamin/hooks'
import type {
  CreateTask,
  GetTask,
  ListTasks,
  UpdateTask,
  ClarifyRequest,
  TaskDispatch,
  CallAgent,
  GetBackgroundOutput,
  CancelBackground,
} from '@vitamin/tools'
import type { OrchestratorOptions } from './types'
import type { RunSessionOptions, RunSessionResult } from './executor'

import { TaskStore } from './task-store'
import { TaskExecutor } from './executor'
import { BackgroundManager } from './background-manager'
import { RetryPolicy, CircuitBreaker } from './retry'

export interface OrchestratorDeps {
  hookRegistry: HookRegistry
  /** 由 VitaminApp 注入：创建子 session → prompt → 提取输出文本 */
  runSession: (options: RunSessionOptions) => Promise<RunSessionResult>
  /** 可选：外部 abort 回调 */
  abortTask?: (taskId: string) => void
}

export class Orchestrator {
  readonly taskStore: TaskStore
  private readonly executor: TaskExecutor
  private readonly backgroundManager: BackgroundManager
  private readonly hookRegistry: HookRegistry
  private readonly circuitBreaker: CircuitBreaker

  constructor(deps: OrchestratorDeps, options: OrchestratorOptions = {}) {
    const { hookRegistry, runSession, abortTask } = deps
    const { workflowConfig, maxActiveTasks = 10 } = options

    this.hookRegistry = hookRegistry
    this.taskStore = new TaskStore()
    const retryPolicy = RetryPolicy.fromWorkflowConfig(workflowConfig)
    this.circuitBreaker = CircuitBreaker.fromWorkflowConfig(workflowConfig)

    this.executor = new TaskExecutor(
      this.taskStore,
      hookRegistry,
      retryPolicy,
      this.circuitBreaker,
      runSession,
      maxActiveTasks,
    )

    this.backgroundManager = new BackgroundManager(this.taskStore, abortTask)
  }

  // ── 核心回调 ──

  dispatchTask: TaskDispatch = async (args) => {
    return this.executor.dispatch(args)
  }

  callAgent: CallAgent = async (agent, prompt, options) => {
    return this.executor.callAgent(agent, prompt, options)
  }

  // ── CRUD 回调 ──

  createTask: CreateTask = async (args) => {
    const task = await this.taskStore.create({
      prompt: args.prompt,
      category: args.category,
      subagent: args.subagent,
    })

    await this.hookRegistry.emit('task.created', {
      task: { ...task } as unknown as Record<string, unknown>,
    })

    return {
      id: task.id,
      success: true,
      message: `Task created: ${task.id}`,
    }
  }

  getTask: GetTask = async (id) => {
    const task = await this.taskStore.get(id)
    if (!task) {
      return { id, status: 'not_found', error: `Task not found: ${id}` }
    }

    return {
      id: task.id,
      status: task.status === 'failed' ? 'error' : task.status,
      prompt: task.input.prompt,
      output: task.output?.text,
      error: task.error?.message,
    }
  }

  listTasks: ListTasks = async (status) => {
    const statusMap: Record<string, string> = { error: 'failed' }

    const filter = status && status !== 'all'
      ? { status: (statusMap[status] ?? status) as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' }
      : undefined

    const tasks = await this.taskStore.list(filter)

    return {
      success: true,
      tasks: tasks.map(t => ({
        id: t.id,
        prompt: t.input.prompt,
        status: t.status === 'failed' ? 'error' : t.status,
      })),
    }
  }

  updateTask: UpdateTask = async (id, action) => {
    const task = await this.taskStore.get(id)
    if (!task) {
      return { success: false, message: `Task not found: ${id}` }
    }

    if (action === 'cancel') {
      if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        return { success: false, message: `Task already in terminal state: ${task.status}` }
      }
      await this.taskStore.update(id, { status: 'cancelled', completedAt: Date.now() })
      await this.hookRegistry.emit('task.cancelled', { taskId: id })
      return { success: true, message: `Task ${id} cancelled` }
    }

    if (action === 'retry') {
      if (task.status !== 'failed') {
        return { success: false, message: `Can only retry failed tasks. Current status: ${task.status}` }
      }
      await this.taskStore.update(id, { status: 'pending', error: undefined })
      const result = await this.dispatchTask({
        prompt: task.input.prompt,
        subagent: task.input.subagent,
        category: task.input.category,
        planId: task.input.planId,
        taskId: task.input.taskId,
        mode: task.input.mode ?? 'sync',
        sessionId: task.input.sessionId,
        sessionMode: task.input.sessionMode,
      })
      return { success: result.success, message: result.output ?? result.error ?? 'Retry completed' }
    }

    return { success: false, message: `Unknown action: ${action}` }
  }

  // ── 后台管理回调 ──

  getBackgroundOutput: GetBackgroundOutput = async (id) => {
    return this.backgroundManager.getOutput(id)
  }

  cancelBackground: CancelBackground = async (id) => {
    return this.backgroundManager.cancel(id)
  }

  // ── Clarify（Phase 1: stub，后续实现 steering 注入） ──

  clarifyRequest: ClarifyRequest = async (_args) => {
    return {
      success: false,
      error: 'Clarify request is not yet implemented. The lead agent should handle clarification directly.',
      escalation: 'lead_agent' as const,
    }
  }

  dispose(): void {
    this.circuitBreaker.reset()
  }
}

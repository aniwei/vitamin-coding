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
  TodoItem,
} from '@vitamin/tools'
import type { OrchestratorOptions } from './types'

import { TaskStore } from './task-store'
import { TaskExecutor } from './executor'
import { BackgroundManager } from './background-manager'
import { RetryPolicy, CircuitBreaker } from './retry'

export type OrchestratorDeps = Pick<
  OrchestratorOptions,
  'hookRegistry' | 'runSession' | 'abortTask'
>

export class Orchestrator {
  readonly taskStore: TaskStore
  private readonly todosBySession = new Map<string, TodoItem[]>()
  private readonly executor: TaskExecutor
  private readonly backgroundManager: BackgroundManager
  private readonly hookRegistry: HookRegistry
  private readonly circuitBreaker: CircuitBreaker

  private getSessionKey(sessionId?: string): string {
    return sessionId?.trim() || '__default__'
  }

  constructor(options: OrchestratorOptions) {
    const { hookRegistry, runSession, abortTask, workflowConfig, maxActiveTasks = 10 } = options

    this.hookRegistry = hookRegistry
    this.taskStore = new TaskStore()
    const retryPolicy = RetryPolicy.fromWorkflowOptions(workflowConfig)
    this.circuitBreaker = CircuitBreaker.fromWorkflowOptions(workflowConfig)

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
    return this.executor.dispatch({
      prompt: args.prompt,
      subagent: args.subagent,
      category: args.category,
      mode: args.mode,
      sessionId: args.sessionId,
      sessionMode: args.sessionMode ?? 'ephemeral',
      slot: args.slot,
    })
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

    const filter =
      status && status !== 'all'
        ? {
            status: (statusMap[status] ?? status) as
              | 'pending'
              | 'running'
              | 'completed'
              | 'failed'
              | 'cancelled',
          }
        : undefined

    const tasks = await this.taskStore.list(filter)

    return {
      success: true,
      tasks: tasks.map((t) => ({
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
        return {
          success: false,
          message: `Can only retry failed tasks. Current status: ${task.status}`,
        }
      }
      await this.taskStore.update(id, { status: 'pending', error: undefined })
      const result = await this.dispatchTask({
        prompt: task.input.prompt,
        subagent: task.input.subagent,
        category: task.input.category,
        mode: task.input.mode ?? 'sync',
        sessionId: task.input.sessionId,
        sessionMode: task.input.sessionMode,
        slot: task.input.slot,
      })
      return {
        success: result.success,
        message: result.output ?? result.error ?? 'Retry completed',
      }
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

  // ── Clarify — 通过 lead agent 会话获取澄清答案 ──

  clarifyRequest: ClarifyRequest = async (args) => {
    const prompt = [
      `A sub-agent working on task "${args.taskId}" needs clarification.`,
      `Reason: ${args.reason ?? 'missing_context'}`,
      `Question: ${args.question}`,
      `Please provide a clear, concise answer to help the sub-agent continue its work.`,
    ].join('\n')

    try {
      const result = await this.executor.callAgent('lead', prompt)

      if (result.success && result.output) {
        return {
          success: true,
          answer: result.output,
        }
      }

      // 如果 lead agent 调用失败，回退到 escalation
      return {
        success: false,
        error: result.error ?? 'Lead agent did not provide an answer.',
        escalation: 'lead_agent' as const,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        escalation: 'lead_agent' as const,
      }
    }
  }

  writeTodos = async (args: {
    action: 'set' | 'update'
    todos: TodoItem[]
    sessionId?: string
  }): Promise<{ success: boolean; todos: TodoItem[] }> => {
    const { sessionId, action, todos } = args
    const sessionKey = this.getSessionKey(sessionId)
    let store = this.todosBySession.get(sessionKey) ?? []

    if (action === 'set') {
      store = [...todos]
    } else {
      const map = new Map(store.map((t) => [t.id, t]))
      for (const todo of todos) {
        map.set(todo.id, todo)
      }
      store = [...map.values()]
    }

    this.todosBySession.set(sessionKey, store)
    return { success: true, todos: store }
  }

  dispose(): void {
    this.circuitBreaker.reset()
  }
}

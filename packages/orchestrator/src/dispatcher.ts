// ═══════════════════════════════════════════════════════════
// @vitamin/orchestrator — Dispatcher 实现
// ═══════════════════════════════════════════════════════════
// 中枢调度：任务创建、路由、同步/异步执行、生命周期管理

import type { OrchestratorEventBus } from './events'
import type {
  AgentRegistry,
  AgentSpec,
  BackgroundManager,
  DispatchArgs,
  DispatchResult,
  Dispatcher,
  OrchestratorTask,
  SessionFactory,
  ToolRegistryHandle,
  HookRegistryHandle,
} from './types'

interface DispatcherDeps {
  agentRegistry: AgentRegistry
  backgroundManager: BackgroundManager
  sessionFactory: SessionFactory
  toolRegistry: ToolRegistryHandle
  eventBus: OrchestratorEventBus
  hooks?: HookRegistryHandle
  maxConcurrent?: number
}

class DispatcherImpl implements Dispatcher {
  private tasks = new Map<string, OrchestratorTask>()
  private runningCount = 0
  private deps: DispatcherDeps
  private maxConcurrent: number

  constructor(deps: DispatcherDeps) {
    this.deps = deps
    this.maxConcurrent = deps.maxConcurrent ?? 5
  }

  async dispatch(args: DispatchArgs): Promise<DispatchResult> {
    // 1. 创建任务记录
    const task = this.createTaskRecord(args)
    this.tasks.set(task.id, task)
    await this.deps.eventBus.emit('task.created', { task })

    // 2. 解析目标 agent
    const spec = this.deps.agentRegistry.resolve({
      name: args.subagent,
      category: args.category,
    })
    if (!spec) {
      task.status = 'failed'
      task.error = {
        code: 'NO_AGENT',
        message: `No matching agent found for: ${args.subagent ?? args.category ?? 'unknown'}`,
        retriable: false,
      }
      task.endedAt = Date.now()
      await this.deps.eventBus.emit('task.failed', { task, error: task.error })
      return { success: false, error: task.error.message }
    }

    // 3. 后台模式 → 交给 BackgroundManager
    if (args.mode === 'background') {
      const taskId = await this.deps.backgroundManager.submit(task, spec)
      return { success: true, id: taskId, status: 'running' }
    }

    // 4. 同步执行
    return this.executeSyncTask(task, spec)
  }

  async create(args: {
    prompt: string
    category?: string
    subagent?: string
  }): Promise<{
    id: string
    success: boolean
    message?: string
    error?: string
  }> {
    // 创建后台任务
    const dispatchResult = await this.dispatch({
      ...args,
      mode: 'background',
    })

    if (!dispatchResult.success) {
      return {
        id: '',
        success: false,
        error: dispatchResult.error,
      }
    }

    return {
      id: dispatchResult.id!,
      success: true,
      message: `Task ${dispatchResult.id} created`,
    }
  }

  async get(id: string): Promise<OrchestratorTask | undefined> {
    return this.tasks.get(id)
  }

  async list(status?: string): Promise<{
    success: boolean
    tasks: Array<{ id: string; prompt: string; status: string }>
    error?: string
  }> {
    let tasks = Array.from(this.tasks.values())

    if (status) {
      tasks = tasks.filter((t) => t.status === status)
    }

    return {
      success: true,
      tasks: tasks.map((t) => ({
        id: t.id,
        prompt: t.input.prompt,
        status: t.status,
      })),
    }
  }

  async update(
    id: string,
    action: 'cancel' | 'retry',
  ): Promise<{ success: boolean; message: string }> {
    const task = this.tasks.get(id)
    if (!task) {
      return { success: false, message: `Task ${id} not found` }
    }

    if (action === 'cancel') {
      if (task.mode === 'background') {
        const result = await this.deps.backgroundManager.cancel(id)
        if (result.success) {
          task.status = 'cancelled'
          task.endedAt = Date.now()
        }
        return { success: result.success, message: result.error ?? `Task ${id} cancelled` }
      }
      // 同步任务不支持取消
      return { success: false, message: 'Cannot cancel synchronous task' }
    }

    if (action === 'retry') {
      if (task.status !== 'failed' && task.status !== 'cancelled') {
        return { success: false, message: `Task ${id} is ${task.status}, cannot retry` }
      }
      if (task.attempts >= task.maxAttempts) {
        return { success: false, message: `Task ${id} exceeded max attempts (${task.maxAttempts})` }
      }

      // 复用同一个 task 对象（保持 id 和 correlationId 的连续性）
      task.status = 'pending'
      task.error = undefined
      task.output = undefined
      task.startedAt = undefined
      task.endedAt = undefined
      task.attempts += 1

      // 重新解析 agent
      const spec = this.deps.agentRegistry.resolve({
        name: task.input.subagent,
        category: task.input.category,
      })
      if (!spec) {
        task.status = 'failed'
        task.error = { code: 'NO_AGENT', message: 'No matching agent found', retriable: false }
        task.endedAt = Date.now()
        return { success: false, message: task.error.message }
      }

      // 根据模式直接重新执行（不经过 dispatch 创建新任务）
      if (task.mode === 'background') {
        await this.deps.backgroundManager.submit(task, spec)
        return { success: true, message: `Task ${id} retried (background)` }
      }

      const result = await this.executeSyncTask(task, spec)
      return {
        success: result.success,
        message: result.success ? `Task ${id} retried` : (result.error ?? 'Retry failed'),
      }
    }

    return { success: false, message: `Unknown action: ${action}` }
  }

  // ═══ 内部方法 ═══

  private async executeSyncTask(
    task: OrchestratorTask,
    spec: AgentSpec,
  ): Promise<DispatchResult> {
    if (this.runningCount >= this.maxConcurrent) {
      task.status = 'failed'
      task.error = {
        code: 'MAX_CONCURRENT',
        message: `Max concurrent tasks reached (${this.maxConcurrent})`,
        retriable: true,
      }
      task.endedAt = Date.now()
      return { success: false, error: task.error.message }
    }

    this.runningCount++
    task.status = 'running'
    task.startedAt = Date.now()

    await this.deps.eventBus.emit('task.started', { task, agent: spec.name })

    try {
      // 获取工具白名单
      const tools = this.deps.toolRegistry.filterByNames(spec.tools ?? [])

      // 创建隔离的子会话（context isolation: deepagents 模式）
      const session = await this.deps.sessionFactory.createSession({
        model: spec.model as never,
        systemPrompt: spec.systemPrompt,
        tools,
      })

      try {
        // 只传任务 prompt，不继承父会话历史
        await session.prompt(task.input.prompt)

        // 提取最后一条助手消息
        const output = session.getLastAssistantText() ?? ''

        task.status = 'completed'
        task.output = {
          text: output,
          summary: output.slice(0, 500),
        }
        task.endedAt = Date.now()

        await this.deps.eventBus.emit('task.completed', { task, result: task.output })

        return { success: true, output, status: 'completed' }
      } finally {
        // 临时会话，用完销毁
        await this.deps.sessionFactory.removeSession(session.id)
      }
    } catch (err) {
      task.status = 'failed'
      task.error = {
        code: 'EXECUTION_ERROR',
        message: String(err),
        retriable: true,
      }
      task.endedAt = Date.now()

      await this.deps.eventBus.emit('task.failed', { task, error: task.error })

      return { success: false, error: String(err) }
    } finally {
      this.runningCount--
    }
  }

  private createTaskRecord(args: DispatchArgs): OrchestratorTask {
    return {
      id: crypto.randomUUID(),
      kind: 'delegate',
      status: 'pending',
      mode: args.mode,
      input: {
        prompt: args.prompt,
        subagent: args.subagent,
        category: args.category,
      },
      attempts: 0,
      maxAttempts: 3,
      correlationId: crypto.randomUUID(),
      createdAt: Date.now(),
    }
  }
}

export function createDispatcher(deps: DispatcherDeps): Dispatcher {
  return new DispatcherImpl(deps)
}

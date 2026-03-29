import type { OrchestratorEventBus } from './events'
import type {
  AgentRegistry,
  AgentSpec,
  BackgroundManager,
  DispatchArgs,
  DispatchResult,
  Dispatcher as IDispatcher,
  ModelSelector,
  OrchestratorTask,
  SessionFactory,
  ToolRegistryHandle,
  HookRegistryHandle,
} from './types'
import type { RetryStrategy } from './retry-strategy'
import type { CircuitBreaker } from './retry-strategy'
import type { ReviewGate, ReviewContext } from './review-gate'
import { parseSubagentResult, resolveAgentTools } from './session-utils'

import type { AgentSessionHandle, ChildSessionMode } from './types'

interface DispatcherContext {
  agentRegistry: AgentRegistry
  backgroundManager: BackgroundManager
  sessionFactory: SessionFactory
  toolRegistry: ToolRegistryHandle
  eventBus: OrchestratorEventBus
  hooks?: HookRegistryHandle
  maxConcurrent?: number
  retryStrategy?: RetryStrategy
  circuitBreaker?: CircuitBreaker
  reviewGate?: ReviewGate
  modelSelector?: ModelSelector
}

class Dispatcher implements IDispatcher {
  private tasks = new Map<string, OrchestratorTask>()
  private runningCount = 0
  private agentRegistry: AgentRegistry
  private backgroundManager: BackgroundManager
  private sessionFactory: SessionFactory
  private toolRegistry: ToolRegistryHandle
  private eventBus: OrchestratorEventBus
  private maxConcurrent: number
  private retryStrategy?: RetryStrategy
  private circuitBreaker?: CircuitBreaker
  private reviewGate?: ReviewGate
  private modelSelector?: ModelSelector

  constructor(context: DispatcherContext) {
    this.agentRegistry = context.agentRegistry
    this.backgroundManager = context.backgroundManager
    this.sessionFactory = context.sessionFactory
    this.toolRegistry = context.toolRegistry
    this.eventBus = context.eventBus
    this.maxConcurrent = context.maxConcurrent ?? 5
    this.retryStrategy = context.retryStrategy
    this.circuitBreaker = context.circuitBreaker
    this.reviewGate = context.reviewGate
    this.modelSelector = context.modelSelector
  }

  async dispatch(args: DispatchArgs): Promise<DispatchResult> {
    // 1. 创建任务记录
    const task = this.createTask(args)
    this.tasks.set(task.id, task)
    await this.eventBus.emit('task.created', { task })

    // 2. 解析目标 agent
    const spec = this.agentRegistry.resolve({
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
      await this.eventBus.emit('task.failed', { task, error: task.error })
      return { success: false, error: task.error.message }
    }

    // 3. 后台模式 → 交给 BackgroundManager
    if (args.mode === 'background') {
      const taskId = await this.backgroundManager.submit(task, spec)
      return { success: true, id: taskId, status: 'running' }
    }

    // 4. 同步执行
    return this.executeSyncTask(task, spec)
  }

  async create(args: {
    prompt: string
    category?: string
    subagent?: string
    sessionId?: string
    sessionMode?: ChildSessionMode
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
        const result = await this.backgroundManager.cancel(id)
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

      // 使用 RetryStrategy 判断是否可重试
      if (this.retryStrategy && task.error) {
        if (!this.retryStrategy.shouldRetry(task.error, task.attempts)) {
          return { success: false, message: `RetryStrategy rejected retry for task ${id} (attempt ${task.attempts})` }
        }
      } else if (task.attempts >= task.maxAttempts) {
        return { success: false, message: `Task ${id} exceeded max attempts (${task.maxAttempts})` }
      }

      // 应用退避延迟
      if (this.retryStrategy) {
        const delay = this.retryStrategy.getDelay(task.attempts)
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }

      // 复用同一个 task 对象（保持 id 和 correlationId 的连续性）
      task.status = 'pending'
      task.error = undefined
      task.output = undefined
      task.startedAt = undefined
      task.endedAt = undefined
      task.attempts += 1

      // 重新解析 agent
      const spec = this.agentRegistry.resolve({
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
        await this.backgroundManager.submit(task, spec)
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
    // 熔断器检查
    if (this.circuitBreaker && !this.circuitBreaker.canExecute()) {
      task.status = 'failed'
      task.error = {
        code: 'CIRCUIT_OPEN',
        message: 'Circuit breaker is open, rejecting execution',
        retriable: true,
      }
      task.endedAt = Date.now()
      return { success: false, error: task.error.message }
    }

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

    await this.eventBus.emit('task.started', { task, agent: spec.name })

    try {
      const tools = resolveAgentTools(spec, this.toolRegistry)
      const stickySession = task.input.sessionMode === 'sticky' && Boolean(task.input.sessionId)

      // 自适应模型选择：允许 ModelSelector 根据任务特征覆盖默认模型
      const selectedModel = this.modelSelector?.selectModel(task, spec)
      const effectiveModel = selectedModel ?? spec.model

      let session: AgentSessionHandle | undefined
      let keepSession = false

      if (stickySession && task.input.sessionId && this.sessionFactory.getSession) {
        session = this.sessionFactory.getSession(task.input.sessionId)
        keepSession = Boolean(session)
      }

      // 创建隔离的子会话（context isolation: deepagents 模式）
      if (!session) {
        session = await this.sessionFactory.createSession({
          id: stickySession ? task.input.sessionId : undefined,
          model: effectiveModel as never,
          systemPrompt: spec.systemPrompt,
          tools,
          maxToolTurns: spec.maxToolTurns,
        })
        keepSession = stickySession
      }

      try {
        // 只传任务 prompt，不继承父会话历史
        await session.prompt(task.input.prompt)

        // 提取最后一条助手消息
        const output = session.getLastAssistantText() ?? ''
        const subagentResult = parseSubagentResult(output)

        // ReviewGate：对子代理产出执行自动化质量审查
        if (this.reviewGate && output) {
          const reviewContext: ReviewContext = {
            taskId: task.id,
            output,
            prompt: task.input.prompt,
          }
          const review = await this.reviewGate.run(reviewContext)
          if (!review.passed) {
            task.status = 'failed'
            const blockerMessages = review.blockers.map(b => b.message).join('; ')
            task.error = {
              code: 'REVIEW_FAILED',
              message: blockerMessages,
              retriable: true,
            }
            task.endedAt = Date.now()
            this.circuitBreaker?.recordFailure()
            await this.eventBus.emit('task.failed', { task, error: task.error })
            return { success: false, error: `Review failed: ${blockerMessages}` }
          }
        }

        task.status = 'completed'
        task.output = {
          text: output,
          summary: output.slice(0, 500),
        }
        task.endedAt = Date.now()

        this.circuitBreaker?.recordSuccess()
  await this.eventBus.emit('task.completed', { task, result: task.output, subagentResult })

        return { success: true, output, status: 'completed' }
      } finally {
        // 默认使用临时子会话；只有显式 sticky 才保留上下文以供后续复用。
        if (!keepSession) {
          await this.sessionFactory.removeSession(session.id)
        }
      }
    } catch (err) {
      task.status = 'failed'
      task.error = {
        code: 'EXECUTION_ERROR',
        message: String(err),
        retriable: true,
      }
      task.endedAt = Date.now()

      this.circuitBreaker?.recordFailure()
      await this.eventBus.emit('task.failed', { task, error: task.error })

      return { success: false, error: String(err) }
    } finally {
      this.runningCount--
    }
  }

  private createTask(args: DispatchArgs): OrchestratorTask {
    return {
      id: crypto.randomUUID(),
      kind: 'delegate',
      status: 'pending',
      mode: args.mode,
      input: {
        prompt: args.prompt,
        subagent: args.subagent,
        category: args.category,
        sessionId: args.sessionId,
        sessionMode: args.sessionMode,
      },
      attempts: 0,
      maxAttempts: 3,
      correlationId: crypto.randomUUID(),
      createdAt: Date.now(),
    }
  }
}

export function createDispatcher(context: DispatcherContext): IDispatcher {
  return new Dispatcher(context)
}

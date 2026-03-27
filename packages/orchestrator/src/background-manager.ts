import type { OrchestratorEventBus } from './events'
import type {
  AgentSpec,
  AgentSessionHandle,
  BackgroundManager,
  OrchestratorTask,
  SessionFactory,
  ToolRegistryHandle,
  HookRegistryHandle,
} from './types'

interface BackgroundManagerDeps {
  eventBus: OrchestratorEventBus
  sessionFactory: SessionFactory
  toolRegistry: ToolRegistryHandle
  hooks?: HookRegistryHandle
}

class BackgroundManagerImpl implements BackgroundManager {
  private runningTasks = new Map<string, OrchestratorTask>()
  private completedTasks = new Map<string, OrchestratorTask>()
  private runningSessions = new Map<string, AgentSessionHandle>()
  private deps: BackgroundManagerDeps

  constructor(deps: BackgroundManagerDeps) {
    this.deps = deps
  }

  async submit(task: OrchestratorTask, spec: AgentSpec): Promise<string> {
    // 先更新任务状态，再发事件（确保订阅者拿到正确的 running 状态）
    task.status = 'running'
    task.startedAt = Date.now()
    this.runningTasks.set(task.id, task)

    // 向 hooks 发射 background.start（兼容 BackgroundTracker）
    await this.deps.hooks?.emit('background.start', {
      taskId: task.id,
      agentName: spec.name,
    })

    await this.deps.eventBus.emit('task.started', { task, agent: spec.name })

    // 异步执行，不阻塞调用方
    this.executeAsync(task, spec).then(
      (output) => {
        // 如果任务已被取消，不要覆盖状态
        if (task.status === 'cancelled') return

        task.status = 'completed'
        task.output = { text: output, summary: output.slice(0, 500) }
        task.endedAt = Date.now()
        this.runningTasks.delete(task.id)
        this.completedTasks.set(task.id, task)

        void this.deps.hooks?.emit('background.end', {
          taskId: task.id,
          agentName: spec.name,
          success: true,
        })
        void this.deps.eventBus.emit('task.completed', { task, result: task.output })
      },
      (err) => {
        // 如果任务已被取消，不要覆盖状态
        if (task.status === 'cancelled') return

        task.status = 'failed'
        task.error = {
          code: 'BG_ERROR',
          message: String(err),
          retriable: true,
        }
        task.endedAt = Date.now()
        this.runningTasks.delete(task.id)
        this.completedTasks.set(task.id, task)

        void this.deps.hooks?.emit('background.end', {
          taskId: task.id,
          agentName: spec.name,
          success: false,
        })
        void this.deps.eventBus.emit('task.failed', { task, error: task.error })
      },
    )

    return task.id
  }

  private async executeAsync(task: OrchestratorTask, spec: AgentSpec): Promise<string> {
    const tools = this.deps.toolRegistry.filterByNames(spec.tools ?? [])

    const session = await this.deps.sessionFactory.createSession({
      model: spec.model as never,
      systemPrompt: spec.systemPrompt,
      tools,
    })

    this.runningSessions.set(task.id, session)

    try {
      await session.prompt(task.input.prompt)
      return session.getLastAssistantText() ?? ''
    } finally {
      this.runningSessions.delete(task.id)
      await this.deps.sessionFactory.removeSession(session.id)
    }
  }

  async getOutput(id: string): Promise<{
    status: string
    success: boolean
    output?: string
    error?: string
  }> {
    // 先查运行中的
    const running = this.runningTasks.get(id)
    if (running) {
      return {
        status: running.status,
        success: false,
      }
    }

    // 再查已完成的
    const completed = this.completedTasks.get(id)
    if (completed) {
      return {
        status: completed.status,
        success: completed.status === 'completed',
        output: completed.output?.text,
        error: completed.error?.message,
      }
    }

    return { status: 'not_found', success: false, error: 'Task not found' }
  }

  async cancel(id: string): Promise<{ success: boolean; error?: string }> {
    const task = this.runningTasks.get(id)
    if (!task) {
      return { success: false, error: 'Task not running' }
    }

    // 通过 AgentSession.abort() 发起协作式取消
    const session = this.runningSessions.get(id)
    if (session) {
      session.abort()
    }

    task.status = 'cancelled'
    task.endedAt = Date.now()
    this.runningTasks.delete(id)
    this.completedTasks.set(id, task)

    await this.deps.eventBus.emit('task.cancelled', { taskId: id })

    return { success: true }
  }

  list(): OrchestratorTask[] {
    return [
      ...this.runningTasks.values(),
      ...this.completedTasks.values(),
    ]
  }
}

export function createBackgroundManager(deps: BackgroundManagerDeps): BackgroundManager {
  return new BackgroundManagerImpl(deps)
}

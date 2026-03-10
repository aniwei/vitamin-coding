// 任务调度器 — §S7.1 双路径调度算法 (subagent 路径 + category 路径)
import { AgentError, createLogger } from '@vitamin/shared'
import type { Model } from '@vitamin/ai'
import type { AgentTool } from '@vitamin/agent'

import type {
  AgentFactoryOptions,
  AgentRegistration,
  AgentResult,
  Dispatcher,
  TaskHandle,
  TaskRequest,
  TaskStatus,
} from '../types'
import { isPlanFamily } from '../types'
import type { AgentRegistry } from '../registry/agent-registry'
import type { CategoryResolver } from './category-resolver'
import type { BackgroundManager } from '../background/background-manager'

const log = createLogger('orchestrator:task-dispatcher')

export interface TaskDispatcherOptions {
  registry: AgentRegistry
  categoryResolver: CategoryResolver
  backgroundManager: BackgroundManager
  resolveModel: (registration: AgentRegistration) => Model
  resolveTools: (registration: AgentRegistration) => AgentTool[]
  defaultFactoryOptions?: AgentFactoryOptions
}

let taskIdCounter = 0

function nextTaskId(): string {
  taskIdCounter += 1
  return `task-${taskIdCounter}`
}

// 内部同步任务句柄
function createSyncTaskHandle(taskId: string): {
  handle: TaskHandle
  resolve: (result: AgentResult) => void
  reject: (error: Error) => void
  setRunning: () => void
} {
  let status: TaskStatus = 'pending'
  let result: AgentResult | undefined
  let error: Error | undefined
  let aborted = false

  const outerResolvers: { doResolve?: (r: AgentResult) => void; doReject?: (e: Error) => void } = {}

  const resultPromise = new Promise<AgentResult>((res, rej) => {
    outerResolvers.doResolve = res
    outerResolvers.doReject = rej
  })

  const handle: TaskHandle = {
    taskId,
    get status() { return status },
    get result() { return result },
    get error() { return error },
    getStatus() { return status },
    getResult() { return resultPromise },
    cancel() {
      if (status === 'pending' || status === 'running') {
        status = 'cancelled'
        aborted = true
        outerResolvers.doReject?.(new AgentError('Task cancelled', { code: 'TASK_CANCELLED' }))
      }
    },
  }

  return {
    handle,
    resolve(r: AgentResult) {
      if (aborted) return
      status = 'completed'
      result = r
      outerResolvers.doResolve?.(r)
    },
    reject(e: Error) {
      if (aborted) return
      status = 'error'
      error = e
      outerResolvers.doReject?.(e)
    },
    setRunning() {
      status = 'running'
    },
  }
}

export class TaskDispatcher implements Dispatcher {
  private readonly registry: AgentRegistry
  private readonly categoryResolver: CategoryResolver
  private readonly backgroundManager: BackgroundManager
  private readonly resolveModel: (registration: AgentRegistration) => Model
  private readonly resolveTools: (registration: AgentRegistration) => AgentTool[]
  private readonly defaultFactoryOptions?: AgentFactoryOptions

  constructor(options: TaskDispatcherOptions) {
    this.registry = options.registry
    this.categoryResolver = options.categoryResolver
    this.backgroundManager = options.backgroundManager
    this.resolveModel = options.resolveModel
    this.resolveTools = options.resolveTools
    this.defaultFactoryOptions = options.defaultFactoryOptions
  }

  async dispatch(request: TaskRequest): Promise<TaskHandle> {
    const taskId = nextTaskId()
    log.debug(`Dispatching task ${taskId}: subagent=${request.subagent}, category=${request.category}, mode=${request.mode}`)

    // §S7.1 路径 A: subagent 路径
    if (request.subagent) {
      return this.dispatchSubagent(taskId, request)
    }

    // §S7.1 路径 B: category 路径
    if (request.category) {
      return this.dispatchCategory(taskId, request)
    }

    // 无路径 — 默认 sisyphus-junior
    log.debug(`No subagent or category specified, defaulting to sisyphus-junior`)
    return this.dispatchSubagent(taskId, { ...request, subagent: 'sisyphus-junior' })
  }

  // §S7.1 路径 A: subagent 路径
  private async dispatchSubagent(taskId: string, request: TaskRequest): Promise<TaskHandle> {
    const registration = this.registry.get(request.subagent!)

    // §S7.2 Plan Family 反递归守卫
    if (request.parentAgent && isPlanFamily(request.parentAgent) && isPlanFamily(request.subagent!)) {
      throw new AgentError(
        `Plan Family recursion detected: ${request.parentAgent} → ${request.subagent}`,
        { code: 'AGENT_PLAN_RECURSION' },
      )
    }

    // 检查 Agent 是否启用
    if (!registration.enabled) {
      throw new AgentError(
        `Agent "${request.subagent}" is disabled`,
        { code: 'AGENT_DISABLED' },
      )
    }

    const model = this.resolveModel(registration)
    const tools = this.resolveTools(registration)
    const agent = registration.factory(model, tools, this.defaultFactoryOptions)

    return this.executeAgent(taskId, agent, request)
  }

  // §S7.1 路径 B: category 路径
  private async dispatchCategory(taskId: string, request: TaskRequest): Promise<TaskHandle> {
    const agentName = this.categoryResolver.resolve(request.category!)
    if (!agentName) {
      throw new AgentError(
        `No agent mapping for category "${request.category}"`,
        { code: 'CATEGORY_NOT_FOUND' },
      )
    }

    // 尝试通过注册中心查找 Agent
    const registration = this.registry.find(agentName)
    if (!registration || !registration.enabled) {
      throw new AgentError(
        `Agent "${agentName}" for category "${request.category}" is not available`,
        { code: 'AGENT_UNAVAILABLE' },
      )
    }

    const model = this.resolveModel(registration)
    const tools = this.resolveTools(registration)
    const agent = registration.factory(model, tools, this.defaultFactoryOptions)

    return this.executeAgent(taskId, agent, request)
  }

  // 统一执行入口
  private async executeAgent(
    taskId: string,
    agent: { prompt(message: string): Promise<AgentResult>; abort(): void },
    request: TaskRequest,
  ): Promise<TaskHandle> {
    // §S7.3 后台模式
    if (request.mode === 'background') {
      return this.backgroundManager.submit(taskId, () => agent.prompt(request.prompt))
    }

    // 同步模式 — §S7.4 含 error→running fallback retry
    const maxRetries = request.maxRetries ?? 1
    const { handle, resolve, reject, setRunning } = createSyncTaskHandle(taskId)
    setRunning()

    const executeWithRetry = async (): Promise<void> => {
      let lastError: Error | undefined

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            log.debug(`Task ${taskId}: retry attempt ${attempt}/${maxRetries} (error→running fallback)`)
          }
          const result = await agent.prompt(request.prompt)
          resolve(result)
          return
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          if (attempt < maxRetries) {
            log.debug(`Task ${taskId}: error on attempt ${attempt}, will retry: ${lastError.message}`)
          }
        }
      }

      reject(lastError ?? new Error('Task failed after retries'))
    }

    executeWithRetry()

    return handle
  }
}

export function createTaskDispatcher(options: TaskDispatcherOptions): Dispatcher {
  return new TaskDispatcher(options)
}

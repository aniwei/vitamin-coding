// 后台任务管理器 — §S7.3 并发控制 + §S7.4 任务状态机
import { AgentError, createLogger } from '@vitamin/shared'

import type { AgentResult, TaskHandle, TaskStatus } from '../types'

const log = createLogger('orchestrator:background-manager')

const DEFAULT_MAX_CONCURRENT_PER_KEY = 5

interface BackgroundTask {
  taskId: string
  concurrencyKey: string
  status: TaskStatus
  result?: AgentResult
  error?: Error
  execute: () => Promise<AgentResult>
  resolve: (result: AgentResult) => void
  reject: (error: Error) => void
  abortController: AbortController
}

export interface BackgroundManagerOptions {
  maxConcurrentPerKey?: number
}

export class BackgroundManager {
  private readonly maxPerKey: number
  private readonly running = new Map<string, Set<string>>()  // concurrencyKey → Set<taskId>
  private readonly queue = new Map<string, BackgroundTask[]>() // concurrencyKey → queued tasks
  private readonly tasks = new Map<string, BackgroundTask>()   // taskId → task

  constructor(options: BackgroundManagerOptions = {}) {
    this.maxPerKey = options.maxConcurrentPerKey ?? DEFAULT_MAX_CONCURRENT_PER_KEY
  }

  // 提交后台任务
  submit(
    taskId: string,
    execute: () => Promise<AgentResult>,
    concurrencyKey = 'default',
  ): Promise<TaskHandle> {
    return new Promise<TaskHandle>((resolveHandle) => {
      let taskResolve!: (result: AgentResult) => void
      let taskReject!: (error: Error) => void

      const resultPromise = new Promise<AgentResult>((res, rej) => {
        taskResolve = res
        taskReject = rej
      })

      const task: BackgroundTask = {
        taskId,
        concurrencyKey,
        status: 'pending',
        execute,
        resolve: taskResolve,
        reject: taskReject,
        abortController: new AbortController(),
      }

      this.tasks.set(taskId, task)

      const handle: TaskHandle = {
        taskId,
        get status() { return task.status },
        get result() { return task.result },
        get error() { return task.error },
        getStatus() { return task.status },
        getResult() { return resultPromise },
        cancel() {
          if (task.status === 'pending' || task.status === 'running') {
            task.status = 'cancelled'
            task.abortController.abort()
            task.reject(new AgentError('Task cancelled', { code: 'TASK_CANCELLED' }))
            log.debug(`Background task ${taskId} cancelled`)
          }
        },
      }

      // 尝试立即执行或排队
      const runningSet = this.running.get(concurrencyKey) ?? new Set()
      this.running.set(concurrencyKey, runningSet)

      if (runningSet.size < this.maxPerKey) {
        this.startTask(task)
      } else {
        const taskQueue = this.queue.get(concurrencyKey) ?? []
        this.queue.set(concurrencyKey, taskQueue)
        taskQueue.push(task)
        log.debug(`Task ${taskId} queued (${runningSet.size}/${this.maxPerKey} running for key "${concurrencyKey}")`)
      }

      resolveHandle(handle)
    })
  }

  // 启动任务
  private startTask(task: BackgroundTask): void {
    if (task.status === 'cancelled') return

    task.status = 'running'
    const runningSet = this.running.get(task.concurrencyKey)!
    runningSet.add(task.taskId)

    log.debug(`Starting background task ${task.taskId} (key="${task.concurrencyKey}")`)

    task.execute()
      .then((result) => {
        if (task.status === 'cancelled') return
        task.status = 'completed'
        task.result = result
        task.resolve(result)
        log.debug(`Background task ${task.taskId} completed`)
      })
      .catch((error: Error) => {
        if (task.status === 'cancelled') return
        task.status = 'error'
        task.error = error
        task.reject(error)
        log.error(`Background task ${task.taskId} failed: ${error.message}`)
      })
      .finally(() => {
        runningSet.delete(task.taskId)
        this.dequeueNext(task.concurrencyKey)
      })
  }

  // 从队列中取出下一个任务执行
  private dequeueNext(concurrencyKey: string): void {
    const taskQueue = this.queue.get(concurrencyKey)
    if (!taskQueue || taskQueue.length === 0) return

    const runningSet = this.running.get(concurrencyKey) ?? new Set()
    while (runningSet.size < this.maxPerKey && taskQueue.length > 0) {
      const nextTask = taskQueue.shift()!
      if (nextTask.status === 'cancelled') continue
      this.startTask(nextTask)
    }
  }

  // 获取指定 key 的运行中任务数
  getRunningCount(concurrencyKey?: string): number {
    if (concurrencyKey) {
      return this.running.get(concurrencyKey)?.size ?? 0
    }
    let total = 0
    for (const set of this.running.values()) {
      total += set.size
    }
    return total
  }

  // 获取指定 key 的排队任务数
  getQueuedCount(concurrencyKey?: string): number {
    if (concurrencyKey) {
      return this.queue.get(concurrencyKey)?.length ?? 0
    }
    let total = 0
    for (const q of this.queue.values()) {
      total += q.length
    }
    return total
  }

  // 获取任务
  getTask(taskId: string): TaskHandle | undefined {
    const task = this.tasks.get(taskId)
    if (!task) return undefined
    return {
      taskId: task.taskId,
      get status() { return task.status },
      get result() { return task.result },
      get error() { return task.error },
      getStatus() { return task.status },
      getResult() {
        return new Promise<AgentResult>((res, rej) => {
          if (task.result) res(task.result)
          else if (task.error) rej(task.error)
          else {
            // 等待完成
            const original = task.resolve
            task.resolve = (r) => { original(r); res(r) }
            const originalReject = task.reject
            task.reject = (e) => { originalReject(e); rej(e) }
          }
        })
      },
      cancel() {
        if (task.status === 'pending' || task.status === 'running') {
          task.status = 'cancelled'
          task.abortController.abort()
          task.reject(new AgentError('Task cancelled', { code: 'TASK_CANCELLED' }))
        }
      },
    }
  }

  // 取消所有任务
  cancelAll(): void {
    for (const task of this.tasks.values()) {
      if (task.status === 'pending' || task.status === 'running') {
        task.status = 'cancelled'
        task.abortController.abort()
        task.reject(new AgentError('Task cancelled', { code: 'TASK_CANCELLED' }))
      }
    }
    this.queue.clear()
    log.info('All background tasks cancelled')
  }

  // 清理
  clear(): void {
    this.cancelAll()
    this.tasks.clear()
    this.running.clear()
    this.queue.clear()
  }
}

export function createBackgroundManager(options?: BackgroundManagerOptions): BackgroundManager {
  return new BackgroundManager(options)
}

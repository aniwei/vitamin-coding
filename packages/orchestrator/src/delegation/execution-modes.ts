// 执行模式包装器 — sync / background 模式抽象
import { createLogger } from '@vitamin/shared'

import type { AgentResult, TaskHandle, TaskStatus } from '../types'

const log = createLogger('orchestrator:execution-modes')

// 同步执行 — 直接等待结果
export async function executeSyncTask(
  taskId: string,
  execute: () => Promise<AgentResult>,
): Promise<TaskHandle> {
  let status: TaskStatus = 'running'
  let result: AgentResult | undefined
  let error: Error | undefined

  const resultPromise = execute()
    .then((r) => {
      status = 'completed'
      result = r
      log.debug(`Sync task ${taskId} completed`)
      return r
    })
    .catch((e: Error) => {
      status = 'error'
      error = e
      log.error(`Sync task ${taskId} failed: ${e.message}`)
      throw e
    })

  return {
    taskId,
    get status() { return status },
    get result() { return result },
    get error() { return error },
    getStatus() { return status },
    getResult() { return resultPromise },
    cancel() {
      if (status === 'running') {
        status = 'cancelled'
        log.debug(`Sync task ${taskId} cancelled`)
      }
    },
  }
}

// 后台执行 — 委托给 BackgroundManager (仅类型约束)
export interface BackgroundExecutor {
  submit(taskId: string, execute: () => Promise<AgentResult>): Promise<TaskHandle>
}

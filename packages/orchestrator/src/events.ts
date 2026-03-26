// ═══════════════════════════════════════════════════════════
// @vitamin/orchestrator — 内部事件总线
// ═══════════════════════════════════════════════════════════
// Phase 1: 独立事件总线，不修改 @vitamin/hooks 基础包
// Phase 2: 可考虑与 HookRegistry 统一

import type { OrchestratorTask, TaskError, TaskOutput } from './types'

// ═══ 事件类型定义 ═══

export interface OrchestratorEventMap {
  'task.created': { task: OrchestratorTask }
  'task.started': { task: OrchestratorTask; agent: string }
  'task.completed': { task: OrchestratorTask; result: TaskOutput }
  'task.failed': { task: OrchestratorTask; error: TaskError }
  'task.cancelled': { taskId: string }
}

export type OrchestratorEventType = keyof OrchestratorEventMap

export type OrchestratorEventHandler<T extends OrchestratorEventType> = (
  payload: OrchestratorEventMap[T],
) => void | Promise<void>

// ═══ EventBus 实现 ═══

export class OrchestratorEventBus {
  private listeners = new Map<string, Set<OrchestratorEventHandler<never>>>()

  on<T extends OrchestratorEventType>(
    event: T,
    handler: OrchestratorEventHandler<T>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }

    const handlers = this.listeners.get(event)!
    handlers.add(handler as OrchestratorEventHandler<never>)

    return () => {
      handlers.delete(handler as OrchestratorEventHandler<never>)
    }
  }

  async emit<T extends OrchestratorEventType>(
    event: T,
    payload: OrchestratorEventMap[T],
  ): Promise<void> {
    const handlers = this.listeners.get(event)
    if (!handlers) return

    const promises: Promise<void>[] = []
    for (const handler of handlers) {
      const result = (handler as OrchestratorEventHandler<T>)(payload)
      if (result instanceof Promise) {
        promises.push(result)
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises)
    }
  }

  off<T extends OrchestratorEventType>(
    event: T,
    handler: OrchestratorEventHandler<T>,
  ): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.delete(handler as OrchestratorEventHandler<never>)
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}

export function createEventBus(): OrchestratorEventBus {
  return new OrchestratorEventBus()
}

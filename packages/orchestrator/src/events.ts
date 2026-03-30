// 基于 @vitamin/shared TypedEventEmitter，扩展异步 emit 能力
// 通过 bridgeEventBusToHooks 统一桥接到 @vitamin/hooks
import { TypedEventEmitter } from '@vitamin/shared'
import type { OrchestratorTask, SubagentResult, TaskError, TaskOutput, HookRegistryHandle } from './types'

export interface OrchestratorEventMap {
  // 任务生命周期
  'task.created': { task: OrchestratorTask }
  'task.started': { task: OrchestratorTask; agent: string }
  'task.completed': { task: OrchestratorTask; result: TaskOutput; subagentResult?: SubagentResult }
  'task.failed': { task: OrchestratorTask; error: TaskError }
  'task.cancelled': { taskId: string }
  // checkpoint 恢复
  'task.recovered': { task: OrchestratorTask; fromCheckpoint: string }
  // review 门禁
  'review.requested': { taskId: string; reviewType: string }
  'review.passed': { taskId: string; reviewType: string }
  'review.failed': { taskId: string; reviewType: string; issues: string[] }
  // 澄清通道
  'clarify.requested': { taskId: string; question: string; reason: string }
  'clarify.responded': { taskId: string; answer: string; escalation?: string }
  'clarify.rejected': { taskId: string; reason: string }
  // Plan 生命周期
  'plan.created': { planId: string; name: string; taskCount: number }
  'plan.updated': { planId: string; action: string }
  'plan.task_dispatched': { planId: string; taskId: string; agentProfile: string }
  'plan.task_completed': { planId: string; taskId: string; status: string }
  'plan.completed': { planId: string; name: string }
}

export type OrchestratorEventType = keyof OrchestratorEventMap

export type OrchestratorEventHandler<T extends OrchestratorEventType> = (
  payload: OrchestratorEventMap[T],
) => void | Promise<void>

// 将 payload 类型映射为 TypedEventEmitter 所需的 handler 函数签名 
type OrchestratorEvents = {
  [K in OrchestratorEventType]: (payload: OrchestratorEventMap[K]) => void
}

export class OrchestratorEventBus extends TypedEventEmitter<OrchestratorEvents> {
  // 异步 emit：触发事件并等待所有 handler 完成（包括返回 Promise 的 handler）。
  // 覆盖父类的同步 emit，保证 await eventBus.emit(...) 能等待异步 handler。
  override async emit<K extends OrchestratorEventType>(
    event: K,
    ...args: Parameters<OrchestratorEvents[K]>
  ): Promise<void> {
    // 访问父类 private listeners（运行时可达）
    const set = (this as any).listeners[event] as Set<OrchestratorEvents[K]> | undefined
    if (!set) return

    const promises: Promise<void>[] = []
    for (const handler of set) {
      const result = (handler as OrchestratorEventHandler<K>)(args[0])
      if (result instanceof Promise) {
        promises.push(result)
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises)
    }
  }

  // 移除所有监听器（别名 removeAllListeners） 
  clear(): void {
    this.removeAllListeners()
  }
}

export function createEventBus(): OrchestratorEventBus {
  return new OrchestratorEventBus()
}

// ═══ EventBus → Hooks 桥接 ═══
const ORCHESTRATOR_EVENTS: OrchestratorEventType[] = [
  'task.created', 
  'task.started', 
  'task.completed', 
  'task.failed', 
  'task.cancelled',
  'task.recovered',
  'review.requested', 
  'review.passed', 
  'review.failed',
  'clarify.requested', 
  'clarify.responded', 
  'clarify.rejected',
  'plan.created',
  'plan.updated',
  'plan.task_dispatched',
  'plan.task_completed',
  'plan.completed',
]

// 将 OrchestratorEventBus 的所有事件桥接到 HookRegistry。
// 每当 eventBus 触发事件时，自动调用 hooks.emit(timing, payload)。
//
// @returns 清理函数，调用后取消所有订阅
export function bridgeEventBusToHooks(
  eventBus: OrchestratorEventBus,
  hooks: HookRegistryHandle,
): () => void {
  const unsubs: Array<() => void> = []

  for (const event of ORCHESTRATOR_EVENTS) {
    unsubs.push(
      eventBus.on(event, async (payload: OrchestratorEventMap[typeof event]) => {
        await hooks.emit(event, payload)
      }),
    )
  }

  return () => {
    for (const unsub of unsubs) unsub()
  }
}

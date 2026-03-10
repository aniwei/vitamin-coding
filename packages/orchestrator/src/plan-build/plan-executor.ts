// Plan Executor — Atlas 驱动的计划执行引擎 (§S14.1 Step 5)
import type { Dispatcher } from '../types'
import type { Plan } from '../agents/prometheus/plan-format'
import {
  buildDag,
  getReadyNodes,
  markFailedAndCascade,
  isDagFinished,
  getDagProgress,
  collectDagResult,
  validateDagNoCycles,
} from '../agents/atlas/dag-executor'
import type { DagNode, DagExecutionResult } from '../agents/atlas/dag-executor'
import type { PlanStorage } from './plan-storage'

// 执行进度回调
export type ProgressCallback = (event: ExecutionProgressEvent) => void

export interface ExecutionProgressEvent {
  type: 'step-start' | 'step-complete' | 'step-failed' | 'step-cancelled' | 'progress'
  stepId: string
  progress: number
  message: string
}

export interface PlanExecutorOptions {
  dispatcher: Dispatcher
  storage: PlanStorage
  onProgress?: ProgressCallback
  maxConcurrency?: number
}

export interface PlanExecutionResult {
  dagResult: DagExecutionResult
  plan: Plan
  totalTime: number
}

// 执行一个计划
export async function executePlan(
  plan: Plan,
  options: PlanExecutorOptions,
): Promise<PlanExecutionResult> {
  const { dispatcher, storage, onProgress, maxConcurrency = 5 } = options
  const start = Date.now()

  // 构建 DAG
  const dag = buildDag(plan.steps)

  // 验证无循环依赖
  if (!validateDagNoCycles(dag)) {
    throw new Error(`Plan "${plan.name}" has circular dependencies`)
  }

  // DAG 循环执行
  while (!isDagFinished(dag)) {
    const readyNodes = getReadyNodes(dag)

    if (readyNodes.length === 0) {
      // 没有可执行节点但尚未完成 → 死锁
      if (!isDagFinished(dag)) {
        break
      }
      continue
    }

    // 限制并行度
    const batch = readyNodes.slice(0, maxConcurrency)

    // 并行执行当前 batch
    const promises = batch.map((node) => executeStep(node, dispatcher, dag, onProgress))
    await Promise.allSettled(promises)

    // 更新计划文件中的 checkbox
    syncDagToPlan(dag, plan)
    await storage.update(plan)

    // 报告进度
    const progress = getDagProgress(dag)
    onProgress?.({
      type: 'progress',
      stepId: '',
      progress,
      message: `Overall progress: ${progress}%`,
    })
  }

  // 最终同步
  syncDagToPlan(dag, plan)
  await storage.update(plan)

  return {
    dagResult: collectDagResult(dag),
    plan,
    totalTime: Date.now() - start,
  }
}

// 执行单个步骤
async function executeStep(
  node: DagNode,
  dispatcher: Dispatcher,
  dag: Map<string, DagNode>,
  onProgress?: ProgressCallback,
): Promise<void> {
  node.status = 'running'

  onProgress?.({
    type: 'step-start',
    stepId: node.step.id,
    progress: getDagProgress(dag),
    message: `Starting: ${node.step.title}`,
  })

  try {
    const handle = await dispatcher.dispatch({
      prompt: `Execute this task step:\n\n**${node.step.title}**\n${node.step.description}`,
      category: node.step.category ?? 'quick',
      mode: 'sync',
      parentAgent: 'atlas',
    })

    const result = await handle.getResult()
    node.status = 'completed'
    node.result = result.output

    onProgress?.({
      type: 'step-complete',
      stepId: node.step.id,
      progress: getDagProgress(dag),
      message: `Completed: ${node.step.title}`,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    markFailedAndCascade(dag, node.step.id, errorMessage)

    onProgress?.({
      type: 'step-failed',
      stepId: node.step.id,
      progress: getDagProgress(dag),
      message: `Failed: ${node.step.title} — ${errorMessage}`,
    })

    // 报告被取消的步骤
    for (const n of dag.values()) {
      if (n.status === 'cancelled') {
        onProgress?.({
          type: 'step-cancelled',
          stepId: n.step.id,
          progress: getDagProgress(dag),
          message: `Cancelled: ${n.step.title}`,
        })
      }
    }
  }
}

// 将 DAG 状态同步回 Plan（更新 step.status）
function syncDagToPlan(dag: Map<string, DagNode>, plan: Plan): void {
  for (const step of plan.steps) {
    const node = dag.get(step.id)
    if (node) {
      step.status = node.status === 'completed' ? 'completed'
        : node.status === 'failed' ? 'failed'
          : node.status === 'cancelled' ? 'cancelled'
            : step.status
    }
  }
}

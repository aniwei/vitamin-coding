// DAG 拓扑排序 + 并行执行引擎 (§S14.1 Step 5)
import type { PlanStep } from '../prometheus/plan-format'

// DAG 节点状态
export type DagNodeStatus = 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface DagNode {
  step: PlanStep
  status: DagNodeStatus
  dependencies: string[]
  dependents: string[]
  result?: string
  error?: string
}

export interface DagExecutionResult {
  completed: DagNode[]
  failed: DagNode[]
  cancelled: DagNode[]
  allSuccessful: boolean
}

// 从 PlanStep 列表构建 DAG
export function buildDag(steps: PlanStep[]): Map<string, DagNode> {
  const dag = new Map<string, DagNode>()

  // 创建节点
  for (const step of steps) {
    dag.set(step.id, {
      step,
      status: 'pending',
      dependencies: [...step.dependencies],
      dependents: [],
      result: undefined,
      error: undefined,
    })
  }

  // 构建反向依赖（依赖者列表）
  for (const [id, node] of dag) {
    for (const dep of node.dependencies) {
      const depNode = dag.get(dep)
      if (depNode) {
        depNode.dependents.push(id)
      }
    }
  }

  return dag
}

// 获取当前可执行的节点（所有依赖已完成 & 自身为 pending）
export function getReadyNodes(dag: Map<string, DagNode>): DagNode[] {
  const ready: DagNode[] = []

  for (const node of dag.values()) {
    if (node.status !== 'pending') continue

    const allDepsCompleted = node.dependencies.every((dep) => {
      const depNode = dag.get(dep)
      return depNode?.status === 'completed'
    })

    if (allDepsCompleted) {
      ready.push(node)
    }
  }

  return ready
}

// 标记节点失败并级联取消依赖此节点的后续步骤
export function markFailedAndCascade(dag: Map<string, DagNode>, failedId: string, error: string): void {
  const failedNode = dag.get(failedId)
  if (!failedNode) return

  failedNode.status = 'failed'
  failedNode.error = error

  // 递归取消所有依赖此节点的后续步骤
  const toCancel = [...failedNode.dependents]
  while (toCancel.length > 0) {
    const cancelId = toCancel.pop()
    if (!cancelId) continue
    const cancelNode = dag.get(cancelId)
    if (!cancelNode || cancelNode.status !== 'pending') continue

    cancelNode.status = 'cancelled'
    cancelNode.error = `已取消：依赖项 ${failedId} 失败`
    toCancel.push(...cancelNode.dependents)
  }
}

// 计算 DAG 执行进度（0-100%）
export function getDagProgress(dag: Map<string, DagNode>): number {
  const total = dag.size
  if (total === 0) return 100

  let completed = 0
  for (const node of dag.values()) {
    if (node.status === 'completed') completed++
  }

  return Math.round((completed / total) * 100)
}

// 检查 DAG 是否执行完毕（无 pending/running 节点）
export function isDagFinished(dag: Map<string, DagNode>): boolean {
  for (const node of dag.values()) {
    if (node.status === 'pending' || node.status === 'running') {
      return false
    }
  }
  return true
}

// 收集执行结果
export function collectDagResult(dag: Map<string, DagNode>): DagExecutionResult {
  const completed: DagNode[] = []
  const failed: DagNode[] = []
  const cancelled: DagNode[] = []

  for (const node of dag.values()) {
    switch (node.status) {
      case 'completed': completed.push(node); break
      case 'failed': failed.push(node); break
      case 'cancelled': cancelled.push(node); break
    }
  }

  return {
    completed,
    failed,
    cancelled,
    allSuccessful: failed.length === 0 && cancelled.length === 0,
  }
}

// 验证 DAG 无循环依赖（Kahn 算法）
export function validateDagNoCycles(dag: Map<string, DagNode>): boolean {
  const inDegree = new Map<string, number>()
  for (const [id, node] of dag) {
    inDegree.set(id, node.dependencies.length)
  }

  const queue: string[] = []
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id)
  }

  let processed = 0
  while (queue.length > 0) {
    const id = queue.shift()!
    processed++

    const node = dag.get(id)
    if (!node) continue

    for (const dependent of node.dependents) {
      const deg = inDegree.get(dependent) ?? 0
      inDegree.set(dependent, deg - 1)
      if (deg - 1 === 0) {
        queue.push(dependent)
      }
    }
  }

  return processed === dag.size
}

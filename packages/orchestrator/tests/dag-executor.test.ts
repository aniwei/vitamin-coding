// DAG 拓扑执行测试 (5.1.4: DAG 并行执行, 5.1.5: 步骤失败回退)
import { describe, expect, it } from 'vitest'

import type { PlanStep } from '../src/agents/prometheus/plan-format'
import {
  buildDag,
  getReadyNodes,
  markFailedAndCascade,
  getDagProgress,
  isDagFinished,
  collectDagResult,
  validateDagNoCycles,
} from '../src/agents/atlas/dag-executor'

function createStep(id: string, deps: string[] = []): PlanStep {
  return {
    id,
    title: `Step ${id}`,
    description: `Description for ${id}`,
    dependencies: deps,
    estimatedMinutes: 5,
    status: 'pending',
  }
}

describe('@vitamin/orchestrator DAG', () => {
  // 5.1.4 验收: Atlas 按 DAG 拓扑并行执行
  describe('#given 3 步骤 DAG (A→B, A→C, B+C→D)', () => {
    const steps: PlanStep[] = [
      createStep('A'),
      createStep('B', ['A']),
      createStep('C', ['A']),
      createStep('D', ['B', 'C']),
    ]

    describe('#when 构建 DAG', () => {
      it('#then 创建 4 个节点', () => {
        const dag = buildDag(steps)
        expect(dag.size).toBe(4)
      })

      it('#then 反向依赖正确构建', () => {
        const dag = buildDag(steps)
        const nodeA = dag.get('A')
        expect(nodeA?.dependents).toContain('B')
        expect(nodeA?.dependents).toContain('C')
      })
    })

    describe('#when 获取初始就绪节点', () => {
      it('#then 只有 A 就绪（无依赖）', () => {
        const dag = buildDag(steps)
        const ready = getReadyNodes(dag)
        expect(ready).toHaveLength(1)
        expect(ready[0]?.step.id).toBe('A')
      })
    })

    describe('#when A 完成后获取就绪节点', () => {
      it('#then B 和 C 并行就绪', () => {
        const dag = buildDag(steps)
        const nodeA = dag.get('A')!
        nodeA.status = 'completed'

        const ready = getReadyNodes(dag)
        expect(ready).toHaveLength(2)
        const readyIds = ready.map((n) => n.step.id).sort()
        expect(readyIds).toEqual(['B', 'C'])
      })
    })

    describe('#when B 和 C 都完成后获取就绪节点', () => {
      it('#then D 就绪', () => {
        const dag = buildDag(steps)
        dag.get('A')!.status = 'completed'
        dag.get('B')!.status = 'completed'
        dag.get('C')!.status = 'completed'

        const ready = getReadyNodes(dag)
        expect(ready).toHaveLength(1)
        expect(ready[0]?.step.id).toBe('D')
      })
    })

    describe('#when 只有 B 完成但 C 未完成', () => {
      it('#then D 不就绪', () => {
        const dag = buildDag(steps)
        dag.get('A')!.status = 'completed'
        dag.get('B')!.status = 'completed'

        const ready = getReadyNodes(dag)
        // C 就绪但 D 不就绪
        expect(ready).toHaveLength(1)
        expect(ready[0]?.step.id).toBe('C')
      })
    })
  })

  // 5.1.5 验收: Atlas 步骤失败时正确回退
  describe('#given 步骤 B 失败', () => {
    describe('#when 标记 B 失败并级联取消', () => {
      it('#then 依赖 B 的步骤 D 被取消', () => {
        const steps: PlanStep[] = [
          createStep('A'),
          createStep('B', ['A']),
          createStep('C', ['A']),
          createStep('D', ['B', 'C']),
        ]
        const dag = buildDag(steps)
        dag.get('A')!.status = 'completed'
        dag.get('B')!.status = 'running'

        markFailedAndCascade(dag, 'B', 'Build error')

        expect(dag.get('B')!.status).toBe('failed')
        expect(dag.get('B')!.error).toBe('Build error')
        expect(dag.get('D')!.status).toBe('cancelled')
      })

      it('#then 不影响独立步骤 C', () => {
        const steps: PlanStep[] = [
          createStep('A'),
          createStep('B', ['A']),
          createStep('C', ['A']),
          createStep('D', ['B', 'C']),
        ]
        const dag = buildDag(steps)
        dag.get('A')!.status = 'completed'

        markFailedAndCascade(dag, 'B', 'error')
        // C 不依赖 B，不受影响
        expect(dag.get('C')!.status).toBe('pending')
      })
    })
  })

  describe('#given 进度计算', () => {
    describe('#when 2/4 步骤完成', () => {
      it('#then 进度为 50%', () => {
        const steps = [createStep('A'), createStep('B'), createStep('C'), createStep('D')]
        const dag = buildDag(steps)
        dag.get('A')!.status = 'completed'
        dag.get('B')!.status = 'completed'

        expect(getDagProgress(dag)).toBe(50)
      })
    })

    describe('#when 空 DAG', () => {
      it('#then 进度为 100%', () => {
        const dag = buildDag([])
        expect(getDagProgress(dag)).toBe(100)
      })
    })
  })

  describe('#given DAG 完成检查', () => {
    describe('#when 有 pending 节点', () => {
      it('#then 未完成', () => {
        const dag = buildDag([createStep('A')])
        expect(isDagFinished(dag)).toBe(false)
      })
    })

    describe('#when 所有节点为终态', () => {
      it('#then 已完成', () => {
        const dag = buildDag([createStep('A'), createStep('B')])
        dag.get('A')!.status = 'completed'
        dag.get('B')!.status = 'failed'
        expect(isDagFinished(dag)).toBe(true)
      })
    })
  })

  describe('#given 结果收集', () => {
    describe('#when 混合状态', () => {
      it('#then 分类统计完成/失败/取消', () => {
        const steps = [createStep('A'), createStep('B', ['A']), createStep('C', ['B'])]
        const dag = buildDag(steps)
        dag.get('A')!.status = 'completed'
        dag.get('B')!.status = 'failed'
        dag.get('C')!.status = 'cancelled'

        const result = collectDagResult(dag)
        expect(result.completed).toHaveLength(1)
        expect(result.failed).toHaveLength(1)
        expect(result.cancelled).toHaveLength(1)
        expect(result.allSuccessful).toBe(false)
      })
    })

    describe('#when 全部成功', () => {
      it('#then allSuccessful 为 true', () => {
        const dag = buildDag([createStep('A')])
        dag.get('A')!.status = 'completed'

        const result = collectDagResult(dag)
        expect(result.allSuccessful).toBe(true)
      })
    })
  })

  describe('#given 循环依赖检测', () => {
    describe('#when 无循环', () => {
      it('#then 验证通过', () => {
        const steps = [createStep('A'), createStep('B', ['A']), createStep('C', ['B'])]
        const dag = buildDag(steps)
        expect(validateDagNoCycles(dag)).toBe(true)
      })
    })

    describe('#when 存在循环 A→B→A', () => {
      it('#then 验证失败', () => {
        const steps = [createStep('A', ['B']), createStep('B', ['A'])]
        const dag = buildDag(steps)
        expect(validateDagNoCycles(dag)).toBe(false)
      })
    })
  })
})

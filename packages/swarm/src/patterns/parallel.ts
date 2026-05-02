import type {
  ParallelResult,
  ParallelTask,
  SwarmAgentDef,
  SwarmContext,
  SwarmEventHandler,
  SwarmRunContextFactory,
} from '../types'
import { AgentNotFoundError } from '../errors'
import { executeAgentTurn } from './shared'

/**
 * 并行模式 — 多个 Agent 同时执行，结果聚合。
 *
 * 灵感来自：
 * - OpenDev Agent Fleet（Rust async 并行扇出）
 * - gstack Parallel Sprints（10-15 并行 sprint）
 * - Open Agent SDK TeamCreate（多 Agent 协同）
 *
 * 适用场景：
 * - 多角度代码审查（安全 + 性能 + 逻辑 同时）
 * - 并行搜索/调研
 * - 多方案探索（同一问题多个 Agent 独立思考，最后聚合）
 */
export async function executeParallel(options: {
  tasks: ParallelTask[]
  agents: Map<string, SwarmAgentDef>
  context: SwarmContext
  createRunContext: SwarmRunContextFactory
  signal: AbortSignal
  emit: SwarmEventHandler
  maxConcurrency?: number
}): Promise<ParallelResult> {
  const { tasks, agents, context, createRunContext, signal, emit, maxConcurrency } = options
  const startTime = Date.now()

  // 验证所有 Agent 存在
  for (const task of tasks) {
    if (!agents.has(task.agentId)) {
      throw new AgentNotFoundError(task.agentId)
    }
  }

  const agentIds = tasks.map((t) => t.agentId)
  emit({ type: 'parallel_fan_out', agentIds })

  const results: ParallelResult['tasks'] = []

  // 受限并发执行
  const limit = maxConcurrency ?? tasks.length
  const pending = [...tasks]
  const running = new Set<Promise<void>>()

  const executeTask = async (task: ParallelTask) => {
    const agentDef = agents.get(task.agentId)
    if (!agentDef) {
      return
    }
    const taskStart = Date.now()

    emit({ type: 'agent_start', agentId: task.agentId })

    try {
      const turnResult = await executeAgentTurn({
        agentDef,
        input: task.input,
        context,
        createRunContext,
        signal,
      })

      const durationMs = Date.now() - taskStart
      results.push({ agentId: task.agentId, output: turnResult, durationMs })
      emit({ type: 'agent_end', agentId: task.agentId, durationMs })
    } catch (error) {
      const durationMs = Date.now() - taskStart
      const err = error instanceof Error ? error : new Error(String(error))

      results.push({
        agentId: task.agentId,
        output: {
          agentId: task.agentId,
          messages: [],
          text: `Error: ${err.message}`,
          tokenUsage: { input: 0, output: 0, cacheRead: 0 },
          durationMs,
        },
        durationMs,
        error: err,
      })

      emit({ type: 'error', agentId: task.agentId, error: err })
      emit({ type: 'agent_end', agentId: task.agentId, durationMs })
    }
  }

  // 并发控制
  while (pending.length > 0 || running.size > 0) {
    if (signal.aborted) {
      break
    }

    while (running.size < limit && pending.length > 0) {
      const task = pending.shift()
      if (!task) {
        break
      }
      const promise = executeTask(task).then(() => {
        running.delete(promise)
      })
      running.add(promise)
    }

    if (running.size > 0) {
      await Promise.race(running)
    }

    emit({
      type: 'parallel_fan_in',
      completedCount: results.length,
      totalCount: tasks.length,
    })
  }

  return {
    tasks: results,
    totalDurationMs: Date.now() - startTime,
  }
}

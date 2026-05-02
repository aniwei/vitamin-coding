import type {
  HierarchicalResult,
  HierarchicalTask,
  SwarmAgentDef,
  SwarmContext,
  SwarmEventHandler,
  SwarmRunContextFactory,
} from '../types'
import { AgentNotFoundError } from '../errors'
import { executeAgentTurn } from './shared'

/**
 * 层级模式 — 上级 Agent (Supervisor) 分解任务，下级 Agent (Worker) 执行。
 *
 * 灵感来自：
 * - InfiAgent (MLA) 树形多级 Agent 系统（Level 3 → Level 2 → Level 1）
 * - Superpowers subagent-driven-development
 * - gstack role-based 流程（CEO → Eng Manager → Developer）
 *
 * 流程：
 * 1. Supervisor 分析输入，生成子任务分配方案
 * 2. 各 Worker 并行或顺序执行子任务
 * 3. Supervisor 汇总结果，生成最终输出
 *
 * 适用场景：
 * - 大型代码重构（Architect 规划 → 多 Developer 各负责模块）
 * - 研究任务（Lead 规划 → 多 Researcher 分别搜索 → Lead 综合）
 * - 项目管理（PM 分解 → 多 Engineer 实施 → PM 审核）
 */
export async function executeHierarchical(options: {
  supervisorId: string
  agents: Map<string, SwarmAgentDef>
  input: string
  context: SwarmContext
  createRunContext: SwarmRunContextFactory
  signal: AbortSignal
  emit: SwarmEventHandler
  maxConcurrency?: number
}): Promise<HierarchicalResult> {
  const { supervisorId, agents, input, context, createRunContext, signal, emit, maxConcurrency } =
    options

  const supervisor = agents.get(supervisorId)
  if (!supervisor) {
    throw new AgentNotFoundError(supervisorId)
  }

  const startTime = Date.now()

  // 阶段 1：Supervisor 生成任务分解方案
  emit({ type: 'agent_start', agentId: supervisorId })

  const workerList = [...agents.values()]
    .filter((a) => a.id !== supervisorId)
    .map((a) => `- "${a.id}": ${a.name} — ${a.description}`)
    .join('\n')

  const planPrompt = [
    input,
    '',
    'You are the supervisor. Break down the task into subtasks and assign each to an available worker.',
    'Available workers:',
    workerList,
    '',
    'Respond in this JSON format:',
    '```json',
    '[',
    '  { "description": "subtask description", "assignedTo": "worker_id" }',
    ']',
    '```',
  ].join('\n')

  const planResult = await executeAgentTurn({
    agentDef: supervisor,
    input: planPrompt,
    context,
    createRunContext,
    signal,
  })

  emit({ type: 'agent_end', agentId: supervisorId, durationMs: Date.now() - startTime })

  // 解析任务计划
  const plan = parsePlan(planResult.text, agents)
  const taskResults: HierarchicalResult['results'] = []

  // 阶段 2：Worker 执行子任务（并发受限）
  const limit = maxConcurrency ?? plan.length
  const pending = [...plan]
  const running = new Set<Promise<void>>()

  const executeSubtask = async (task: HierarchicalTask) => {
    const workerId = task.assignedTo
    if (!workerId || !agents.has(workerId)) {
      return
    }

    const workerDef = agents.get(workerId)
    if (!workerDef) {
      return
    }
    emit({
      type: 'hierarchy_delegate',
      supervisor: supervisorId,
      worker: workerId,
      task: task.description,
    })
    emit({ type: 'agent_start', agentId: workerId })

    const taskStart = Date.now()

    try {
      const result = await executeAgentTurn({
        agentDef: workerDef,
        input: task.description,
        context,
        createRunContext,
        signal,
      })

      const durationMs = Date.now() - taskStart
      taskResults.push({ task, agentId: workerId, output: result, durationMs })
      emit({ type: 'agent_end', agentId: workerId, durationMs })
    } catch (error) {
      const durationMs = Date.now() - taskStart
      const err = error instanceof Error ? error : new Error(String(error))

      taskResults.push({
        task,
        agentId: workerId,
        output: {
          agentId: workerId,
          messages: [],
          text: `Error: ${err.message}`,
          tokenUsage: { input: 0, output: 0, cacheRead: 0 },
          durationMs,
        },
        durationMs,
      })

      emit({ type: 'error', agentId: workerId, error: err })
      emit({ type: 'agent_end', agentId: workerId, durationMs })
    }
  }

  while (pending.length > 0 || running.size > 0) {
    if (signal.aborted) {
      break
    }

    while (running.size < limit && pending.length > 0) {
      const task = pending.shift()
      if (!task) {
        break
      }
      const promise = executeSubtask(task).then(() => {
        running.delete(promise)
      })
      running.add(promise)
    }

    if (running.size > 0) {
      await Promise.race(running)
    }
  }

  // 阶段 3：Supervisor 汇总
  emit({ type: 'agent_start', agentId: supervisorId })

  const summaryParts = taskResults.map(
    (r) => `## ${r.task.description} (by ${r.agentId})\n${r.output.text}`,
  )
  const synthesisPrompt = [
    'The subtasks have been completed. Here are the results:',
    '',
    ...summaryParts,
    '',
    'Synthesize these results into a final coherent response for the original task:',
    input,
  ].join('\n')

  const synthesis = await executeAgentTurn({
    agentDef: supervisor,
    input: synthesisPrompt,
    context,
    createRunContext,
    signal,
  })

  emit({
    type: 'agent_end',
    agentId: supervisorId,
    durationMs: Date.now() - startTime,
  })

  return {
    supervisorId,
    plan,
    results: taskResults,
    synthesis,
    totalDurationMs: Date.now() - startTime,
  }
}

/** 从 Supervisor 输出中解析任务计划 */
function parsePlan(text: string, agents: Map<string, SwarmAgentDef>): HierarchicalTask[] {
  // 尝试提取 JSON 块
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = jsonMatch?.[1] ?? text

  try {
    const parsed = JSON.parse(raw.trim())
    if (!Array.isArray(parsed)) {
      return [{ description: text }]
    }

    return parsed.map((item: Record<string, unknown>) => ({
      description: String(item.description ?? ''),
      assignedTo:
        typeof item.assignedTo === 'string' && agents.has(item.assignedTo)
          ? item.assignedTo
          : undefined,
    }))
  } catch {
    // JSON 解析失败 — 回退到简单拆分
    return [{ description: text }]
  }
}

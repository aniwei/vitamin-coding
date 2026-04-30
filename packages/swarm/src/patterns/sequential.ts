import type {
  PipelineStepResult,
  SwarmAgentDef,
  SwarmAgentId,
  SwarmContext,
  SwarmEventHandler,
  SwarmRunContextFactory,
  SwarmTurnResult,
} from '../types'
import { AgentNotFoundError, PipelineError } from '../errors'
import { executeAgentTurn } from './shared'

/**
 * 流水线模式 — Agent 按指定顺序依次执行。
 * 
 * 前一个 Agent 的输出作为下一个 Agent 的输入（追加到 messages 中），
 * 形成数据处理流水线，类似 Unix Pipeline。
 * 
 * 适用场景：
 * - 代码审查流水线：Lint → Security → Logic Review → Summary
 * - 文档处理：Extract → Transform → Generate
 * - 多阶段重构：Plan → Implement → Test → Document
 */
export async function executeSequential(options: {
  pipeline: SwarmAgentId[]
  agents: Map<string, SwarmAgentDef>
  input: string
  context: SwarmContext
  createRunContext: SwarmRunContextFactory
  signal: AbortSignal
  emit: SwarmEventHandler
}): Promise<{ steps: PipelineStepResult[]; finalOutput: SwarmTurnResult }> {
  const { pipeline, agents, input, context, createRunContext, signal, emit } = options

  if (pipeline.length === 0) {
    throw new PipelineError('Pipeline is empty')
  }

  // 验证所有 Agent 存在
  for (const agentId of pipeline) {
    if (!agents.has(agentId)) {
      throw new AgentNotFoundError(agentId)
    }
  }

  const steps: PipelineStepResult[] = []
  let currentInput = input

  for (let i = 0; i < pipeline.length; i++) {
    if (signal.aborted) {break}

    const agentId = pipeline[i]!
    const agentDef = agents.get(agentId)!

    emit({ type: 'pipeline_step', step: i, agentId })
    emit({ type: 'agent_start', agentId })

    const startTime = Date.now()

    // 构造此 Agent 的输入：前一步的输出 + 流水线上下文
    const pipelinePrompt = i === 0
      ? currentInput
      : `Previous agent output:\n\n${currentInput}\n\nYour task: ${agentDef.description}`

    const turnResult = await executeAgentTurn({
      agentDef,
      input: pipelinePrompt,
      context,
      createRunContext,
      signal,
    })

    const durationMs = Date.now() - startTime

    steps.push({ agentId, output: turnResult, durationMs })
    currentInput = turnResult.text

    emit({ type: 'agent_end', agentId, durationMs })
  }

  const finalStep = steps[steps.length - 1]
  if (!finalStep) {
    throw new PipelineError('Pipeline produced no results')
  }

  return { steps, finalOutput: finalStep.output }
}

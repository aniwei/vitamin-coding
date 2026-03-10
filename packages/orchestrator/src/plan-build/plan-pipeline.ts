// Plan Pipeline — 6 步完整管线 (§S14.1)
// Metis(预分析) → Prometheus(生成计划) → Momus(审查) → Atlas(执行) → Hephaestus(迭代修复) → Oracle(验证)
import type { AgentResult, Dispatcher, TaskRequest } from '../types'
import type { Plan } from '../agents/prometheus/plan-format'
import { markdownToPlan } from '../agents/prometheus/plan-format'
import { parseMomusOutput } from '../agents/momus'
import { executePlan } from './plan-executor'
import type { PlanStorage } from './plan-storage'

// Pipeline 状态
export type PipelinePhase = 'metis' | 'prometheus' | 'momus' | 'revision' | 'atlas' | 'hephaestus' | 'oracle' | 'completed' | 'failed'

export interface PipelineState {
  phase: PipelinePhase
  userRequest: string
  metisOutput?: string
  plan?: Plan
  momusResult?: { approved: boolean; issues: string[] }
  revisionCount: number
  maxRevisions: number
}

export interface PipelineResult {
  success: boolean
  plan?: Plan
  planPath?: string
  failureReason?: string
  phases: PipelinePhase[]
  executionResult?: { allSuccessful: boolean; completedSteps: number; failedSteps: number }
  verificationPassed?: boolean
}

export interface PipelineOptions {
  maxRevisions?: number
  maxHephaestusIterations?: number
  dispatcher: Dispatcher
  storage: PlanStorage
  executeAfterApproval?: boolean
}

// 创建并执行完整 6 步 Plan Pipeline
export async function executePlanPipeline(
  userRequest: string,
  options: PipelineOptions,
): Promise<PipelineResult> {
  const {
    dispatcher,
    storage,
    maxRevisions = 2,
    maxHephaestusIterations = 2,
    executeAfterApproval = true,
  } = options
  const phases: PipelinePhase[] = []

  const state: PipelineState = {
    phase: 'metis',
    userRequest,
    revisionCount: 0,
    maxRevisions,
  }

  // ═══ Step 1: Metis 预分析 ═══
  phases.push('metis')
  state.phase = 'metis'
  const metisResult = await dispatchToAgent(dispatcher, {
    prompt: `Analyze this request and provide a pre-analysis context:\n\n${userRequest}`,
    subagent: 'metis',
    mode: 'sync',
  })

  if (!metisResult.result) {
    return { success: false, failureReason: 'Metis analysis failed', phases }
  }
  state.metisOutput = metisResult.result.output

  // ═══ Step 2: Prometheus 生成计划 ═══
  phases.push('prometheus')
  state.phase = 'prometheus'
  let prometheusOutput = await generatePlan(dispatcher, userRequest, state.metisOutput)

  if (!prometheusOutput) {
    return { success: false, failureReason: 'Prometheus plan generation failed', phases }
  }

  // ═══ Step 3: Momus 审查 (最多 maxRevisions 轮) ═══
  while (state.revisionCount <= maxRevisions) {
    phases.push('momus')
    state.phase = 'momus'
    const momusResult = await dispatchToAgent(dispatcher, {
      prompt: `Review this plan:\n\n${prometheusOutput}`,
      subagent: 'momus',
      mode: 'sync',
    })

    if (!momusResult.result) {
      return { success: false, failureReason: 'Momus review failed', phases }
    }

    const review = parseMomusOutput(momusResult.result.output)
    state.momusResult = review

    if (review.approved) {
      break
    }

    if (state.revisionCount >= maxRevisions) {
      return {
        success: false,
        failureReason: `Plan rejected after ${maxRevisions} revisions: ${review.issues.join('; ')}`,
        phases,
      }
    }

    // 修订计划
    phases.push('revision')
    state.phase = 'revision'
    state.revisionCount++

    const revisionPrompt = [
      `Revise the plan based on reviewer feedback:`,
      `\nOriginal request: ${userRequest}`,
      `\nCurrent plan:\n${prometheusOutput}`,
      `\nReviewer issues:\n${review.issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}`,
      `\nPlease fix these issues and regenerate the plan.`,
    ].join('\n')

    const revision = await dispatchToAgent(dispatcher, {
      prompt: revisionPrompt,
      subagent: 'prometheus',
      mode: 'sync',
    })

    if (!revision.result) {
      return { success: false, failureReason: 'Prometheus revision failed', phases }
    }

    prometheusOutput = revision.result.output
  }

  // 解析并保存计划
  const planName = derivePlanName(userRequest)
  const plan = markdownToPlan(planName, prometheusOutput)
  state.plan = plan

  const planPath = await storage.save(plan)

  // 如果不需要执行，直接返回审批后的计划
  if (!executeAfterApproval) {
    phases.push('completed')
    state.phase = 'completed'
    return { success: true, plan, planPath, phases }
  }

  // ═══ Step 4: Atlas 执行计划（DAG 并行） ═══
  phases.push('atlas')
  state.phase = 'atlas'

  const executionResult = await executePlan(plan, {
    dispatcher,
    storage,
    maxConcurrency: 5,
  })

  const dagResult = executionResult.dagResult
  let executionSummary = {
    allSuccessful: dagResult.allSuccessful,
    completedSteps: dagResult.completed.length,
    failedSteps: dagResult.failed.length,
  }

  // ═══ Step 5: Hephaestus 迭代修复失败步骤 ═══
  if (!dagResult.allSuccessful && dagResult.failed.length > 0) {
    let hephaestusIterations = 0

    while (hephaestusIterations < maxHephaestusIterations && dagResult.failed.length > 0) {
      phases.push('hephaestus')
      state.phase = 'hephaestus'
      hephaestusIterations++

      const failedSummary = dagResult.failed
        .map((n) => `- ${n.step.title}: ${n.error ?? 'unknown error'}`)
        .join('\n')

      const hephaestusResult = await dispatchToAgent(dispatcher, {
        prompt: [
          `Fix the failed steps in this plan execution:`,
          `\nOriginal request: ${userRequest}`,
          `\nFailed steps:\n${failedSummary}`,
          `\nAnalyze and attempt to fix each failure.`,
        ].join('\n'),
        subagent: 'hephaestus',
        mode: 'sync',
      })

      if (!hephaestusResult.result) {
        break
      }

      // 重新执行失败的步骤
      for (const failedNode of dagResult.failed) {
        failedNode.status = 'pending'
        failedNode.error = undefined
      }
      for (const cancelledNode of dagResult.cancelled) {
        cancelledNode.status = 'pending'
      }

      const retryResult = await executePlan(plan, {
        dispatcher,
        storage,
        maxConcurrency: 5,
      })

      executionSummary = {
        allSuccessful: retryResult.dagResult.allSuccessful,
        completedSteps: retryResult.dagResult.completed.length,
        failedSteps: retryResult.dagResult.failed.length,
      }

      if (retryResult.dagResult.allSuccessful) {
        break
      }
    }
  }

  // ═══ Step 6: Oracle 验证最终结果 ═══
  phases.push('oracle')
  state.phase = 'oracle'

  const oracleResult = await dispatchToAgent(dispatcher, {
    prompt: [
      `Verify the execution results:`,
      `\nOriginal request: ${userRequest}`,
      `\nPlan: ${plan.title}`,
      `\nExecution summary:`,
      `  - Completed: ${executionSummary.completedSteps} steps`,
      `  - Failed: ${executionSummary.failedSteps} steps`,
      `  - All successful: ${executionSummary.allSuccessful}`,
      `\nVerify the results meet the original requirements.`,
    ].join('\n'),
    subagent: 'oracle',
    mode: 'sync',
  })

  const verificationPassed = oracleResult.result !== undefined

  phases.push('completed')
  state.phase = 'completed'

  return {
    success: executionSummary.allSuccessful,
    plan,
    planPath,
    phases,
    executionResult: executionSummary,
    verificationPassed,
  }
}

// 分发给指定 Agent
async function dispatchToAgent(
  dispatcher: Dispatcher,
  request: Omit<TaskRequest, 'parentAgent'>,
): Promise<{ result?: AgentResult }> {
  try {
    const handle = await dispatcher.dispatch({
      ...request,
      parentAgent: 'plan-pipeline',
    })
    const result = await handle.getResult()
    return { result }
  } catch {
    return {}
  }
}

// 生成计划
async function generatePlan(
  dispatcher: Dispatcher,
  userRequest: string,
  metisContext: string,
): Promise<string | undefined> {
  const prompt = [
    `Generate an execution plan for:`,
    `\nUser Request: ${userRequest}`,
    `\nPre-Analysis (from Metis):\n${metisContext}`,
    `\nGenerate a structured plan with steps, dependencies, and time estimates.`,
  ].join('\n')

  const result = await dispatchToAgent(dispatcher, {
    prompt,
    subagent: 'prometheus',
    mode: 'sync',
  })

  return result.result?.output
}

// 从用户请求中推导计划名称
function derivePlanName(request: string): string {
  return request
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .slice(0, 4)
    .join('-')
}

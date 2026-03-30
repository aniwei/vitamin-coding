// ═══════════════════════════════════════════════════════════
// AgentSpecFactory — 运行时 AgentSpec 组装
// ═══════════════════════════════════════════════════════════

import type {
  AgentSpec,
  Plan,
  PlanTask,
  RegisteredAgentProfile,
  SkillAdapter,
  TaskExecutionSpec,
} from './types'
import { TASK_TYPE_PROFILE_MAP } from './task-type-router'

/**
 * 为 plan task 生成默认的 TaskExecutionSpec（当 task.execution 不存在时）。
 * Phase A 使用规则引擎；后续可接入轻量 planner 模型调用。
 */
export function ensureTaskExecutionSpec(
  _plan: Plan,
  task: PlanTask,
): TaskExecutionSpec {
  if (task.execution) return task.execution
  return {
    agentProfile: TASK_TYPE_PROFILE_MAP[task.type],
    workflowSlot: 'execution',
    generatedAt: Date.now(),
  }
}

/**
 * 基于 profile + plan + task + execution + skills 组装最终 AgentSpec。
 * 这是 dispatch 前的最后一步——生成 agent loop 真正消费的可执行 spec。
 */
export function buildAgentSpec(
  profile: RegisteredAgentProfile,
  plan: Plan,
  task: PlanTask,
  execution: TaskExecutionSpec,
  skillContext?: string,
): AgentSpec {
  const systemPrompt = profile.systemPromptTemplate
    .replace('{plan_goal}', plan.goal)
    .replace('{plan_architecture}', plan.architecture ?? 'N/A')
    .replace('{plan_constraints}', (plan.constraints ?? []).join('\n') || 'None')
    .replace('{task_title}', task.title)
    .replace('{task_description}', task.description)
    .replace('{task_files}', (task.files ?? []).join(', ') || 'N/A')
    + (execution.systemPromptAddendum ? `\n\n## Execution Notes\n${execution.systemPromptAddendum}` : '')
    + (skillContext ? `\n\n## Skill Reference\n${skillContext}` : '')

  return {
    name: `${profile.name}:${task.id}`,
    description: `${profile.name} executing: ${task.title}`,
    model: '', // 由 Dispatcher/ModelSelector 在 dispatch 阶段决定
    systemPrompt,
    tools: execution.tools ?? profile.defaultTools ?? [],
    maxToolTurns: execution.maxToolTurns ?? profile.defaultMaxToolTurns,
    capabilities: profile.capabilities,
    modelSlots: { [execution.workflowSlot ?? 'execution']: '' },
  }
}

/**
 * 完整的 AgentSpec 准备流程：
 * 1. TaskExecutionSpec 确保存在
 * 2. 加载 skill context
 * 3. 组装 AgentSpec
 */
export async function prepareAgentSpec(
  profile: RegisteredAgentProfile,
  plan: Plan,
  task: PlanTask,
  skillAdapter?: SkillAdapter,
): Promise<AgentSpec> {
  const execution = ensureTaskExecutionSpec(plan, task)
  const skillContextParts: string[] = []

  if (skillAdapter && execution.requiredSkills) {
    for (const skillName of execution.requiredSkills) {
      const loaded = await skillAdapter.load(skillName)
      if (loaded.success && skillAdapter.getContext) {
        const ctx = await skillAdapter.getContext(skillName)
        if (ctx) skillContextParts.push(ctx)
      }
    }
  }

  return buildAgentSpec(
    profile,
    plan,
    task,
    execution,
    skillContextParts.length > 0 ? skillContextParts.join('\n\n---\n\n') : undefined,
  )
}

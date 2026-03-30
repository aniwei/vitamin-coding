import { createEventBus, bridgeEventBusToHooks } from './events'
import { createAgentRegistry } from './agent-registry'
import { createBackgroundManager } from './background-manager'
import { createDispatcher } from './dispatcher'
import { resolveAgentProfileForTask } from './task-type-router'
import { prepareAgentSpec } from './agent-spec-factory'

import type { OrchestratorEventBus } from './events'
import type {
  AgentRegistry,
  AgentSpec,
  BackgroundManager,
  Dispatcher,
  OrchestratorOptions,
  PlanStore,
  PlanStatus,
  PlanTask,
  PlanTaskStatus,
  AgentProfileRegistry,
  SkillAdapter,
  TaskType,
} from './types'
import type { CheckpointStore } from './checkpoint-store'
import type { ClarifyChannel, ClarifyEscalation, ClarifyReason } from './clarify-channel'
import type { ReviewGate } from './review-gate'


export interface Orchestrator {
  readonly agentRegistry: AgentRegistry
  readonly dispatcher: Dispatcher
  readonly backgroundManager: BackgroundManager
  readonly eventBus: OrchestratorEventBus
  readonly checkpointStore: CheckpointStore | undefined
  readonly clarifyChannel: ClarifyChannel | undefined
  readonly reviewGate: ReviewGate | undefined
  readonly planStore: PlanStore | undefined
  readonly agentProfileRegistry: AgentProfileRegistry | undefined

  toToolCallbacks(skillAdapter?: SkillAdapter): ToolCallbacks
}

export interface ToolCallbacks {
  dispatchTask: (args: {
    prompt?: string
    planId?: string
    taskId?: string
    subagent?: string
    category?: string
    mode: 'sync' | 'background'
    sessionId?: string
    sessionMode?: 'ephemeral' | 'sticky'
    workflowSlot?: string
  }) => Promise<{
    success: boolean
    output?: string
    id?: string
    status?: string
    error?: string
  }>

  callAgent: (
    agent: string,
    prompt: string,
    options?: { mode?: 'sync' | 'async'; sessionId?: string },
  ) => Promise<{ success: boolean; output?: string; error?: string }>



  createTask: (args: {
    prompt: string
    category?: string
    subagent?: string
  }) => Promise<{
    id: string
    success: boolean
    message?: string
    error?: string
  }>

  getTask: (id: string) => Promise<{
    id: string
    status: string
    prompt?: string
    output?: string
    error?: string
  }>

  listTasks: (status?: string) => Promise<{
    success: boolean
    tasks: Array<{ id: string; prompt: string; status: string }>
    error?: string
  }>

  updateTask: (
    id: string,
    action: 'cancel' | 'retry',
  ) => Promise<{ success: boolean; message: string }>

  getBackgroundOutput: (id: string) => Promise<{
    status: string
    success: boolean
    output?: string
    error?: string
  }>

  cancelBackground: (id: string) => Promise<{
    success: boolean
    error?: string
  }>

  loadSkill: (path: string) => Promise<{
    success: boolean
    name?: string
    error?: string
  }>

  executeSkill: (
    name: string,
    input?: string,
    parameters?: Record<string, string>,
  ) => Promise<{
    success: boolean
    output?: string
    error?: string
  }>

  clarifyRequest?: (args: {
    taskId: string
    question: string
    reason?: ClarifyReason
  }) => Promise<{
    success: boolean
    answer?: string
    escalation?: ClarifyEscalation
    error?: string
  }>

  // ═══ Plan 回调 ═══
  planCreate?: (args: {
    name: string
    goal: string
    architecture?: string
    constraints?: string[]
    tasks: Array<{
      title: string
      description: string
      type: string
      dependencies?: string[]
      files?: string[]
      estimatedComplexity?: 'low' | 'medium' | 'high'
    }>
    sessionId: string
  }) => Promise<{ planId: string; taskCount: number; status: string; error?: string }>

  planGet?: (args: {
    planId?: string
    detail: 'summary' | 'full'
    sessionId: string
  }) => Promise<{ found: boolean; text: string; error?: string }>

  planList?: (args: {
    status?: string
    sessionId: string
  }) => Promise<{
    plans: Array<{ id: string; name: string; status: string; taskCount: number; completedCount: number }>
    error?: string
  }>

  planUpdate?: (args: {
    planId: string
    action: string
    tasks?: Array<{ title: string; description: string; type: string; dependencies?: string[]; files?: string[]; estimatedComplexity?: 'low' | 'medium' | 'high' }>
    taskId?: string
    taskPatch?: Record<string, unknown>
  }) => Promise<{ success: boolean; text: string; error?: string }>
}

export function createOrchestrator(
  options: OrchestratorOptions
): Orchestrator {
  const eventBus = createEventBus()

  // 桥接 eventBus → hooks（统一事件体系）
  if (options.hooks) {
    bridgeEventBusToHooks(eventBus, options.hooks)
  }

  const agentRegistry = createAgentRegistry({
    sessionFactory: options.sessionFactory,
    toolRegistry: options.toolRegistry,
    router: options.router,
  })

  const backgroundManager = createBackgroundManager({
    eventBus,
    sessionFactory: options.sessionFactory,
    toolRegistry: options.toolRegistry,
    hooks: options.hooks,
  })

  // 回注 backgroundManager 以支持 agent_call async 模式
  agentRegistry.setBackgroundManager(backgroundManager)

  const dispatcher = createDispatcher({
    agentRegistry,
    backgroundManager,
    sessionFactory: options.sessionFactory,
    toolRegistry: options.toolRegistry,
    eventBus,
    hooks: options.hooks,
    maxConcurrent: options.maxConcurrent,
    retryStrategy: options.retryStrategy,
    circuitBreaker: options.circuitBreaker,
    reviewGate: options.reviewGate,
    modelSelector: options.modelSelector,
  })

  const checkpointStore = options.checkpointStore ?? undefined

  // Phase 3: Clarify Channel + Review Gate
  const clarifyChannel = options.clarifyChannel ?? undefined
  const reviewGate = options.reviewGate ?? undefined

  // Plan system
  const planStore = options.planStore ?? undefined
  const agentProfileRegistry = options.agentProfileRegistry ?? undefined

  return {
    agentRegistry,
    dispatcher,
    backgroundManager,
    eventBus,
    checkpointStore,
    clarifyChannel,
    reviewGate,
    planStore,
    agentProfileRegistry,

    toToolCallbacks(skillAdapter?: SkillAdapter): ToolCallbacks {
      const resolvedSkillAdapter = skillAdapter ?? options.skillAdapter
      const noSkill = () =>
        Promise.resolve({ success: false, error: 'SkillAdapter not provided' } as never)

      return {
        dispatchTask: async (args) => {
          // Plan-based dispatch: 从 PlanStore 加载 task → 解析 profile → 组装 AgentSpec → dispatch
          if (args.planId && planStore && agentProfileRegistry) {
            return handlePlanDispatch(
              { planId: args.planId, taskId: args.taskId, mode: args.mode, sessionId: args.sessionId, sessionMode: args.sessionMode, workflowSlot: args.workflowSlot },
              planStore,
              agentProfileRegistry,
              dispatcher,
              eventBus,
              agentRegistry,
              resolvedSkillAdapter,
            )
          }
          // Standalone dispatch (backward compatible) — prompt is required here
          return dispatcher.dispatch({
            prompt: args.prompt ?? '',
            subagent: args.subagent,
            category: args.category,
            mode: args.mode,
            sessionId: args.sessionId,
            sessionMode: args.sessionMode,
            workflowSlot: args.workflowSlot,
          })
        },
        callAgent: (agent, prompt, opts) => agentRegistry.call(agent, prompt, opts),

        createTask: (args) => dispatcher.create(args),
        getTask: async (id) => {
          const task = await dispatcher.get(id)
          if (!task) {
            return { id, status: 'not_found', error: 'Task not found' }
          }
          return {
            id: task.id,
            status: task.status,
            prompt: task.input.prompt,
            output: task.output?.text,
            error: task.error?.message,
          }
        },
        listTasks: (status) => dispatcher.list(status),
        updateTask: (id, action) => dispatcher.update(id, action),
        getBackgroundOutput: (id) => backgroundManager.getOutput(id),
        cancelBackground: (id) => backgroundManager.cancel(id),
        loadSkill: resolvedSkillAdapter?.load ?? noSkill,
        executeSkill: resolvedSkillAdapter?.execute ?? noSkill,
        clarifyRequest: clarifyChannel
          ? (args) => clarifyChannel.request(args)
          : undefined,

        // Plan callbacks
        planCreate: planStore
          ? async (args) => {
              try {
                const plan = await planStore.create({
                  id: '',
                  version: 0,
                  name: args.name,
                  goal: args.goal,
                  architecture: args.architecture,
                  constraints: args.constraints,
                  tasks: args.tasks.map((t, i) => ({
                    id: t.dependencies?.length ? `task-${i + 1}` : `task-${i + 1}`,
                    title: t.title,
                    description: t.description,
                    type: t.type as TaskType,
                    status: 'pending' as PlanTaskStatus,
                    dependencies: t.dependencies,
                    files: t.files,
                    estimatedComplexity: t.estimatedComplexity,
                    attempts: 0,
                  })),
                  status: 'active',
                  sessionId: args.sessionId,
                  createdAt: 0,
                  updatedAt: 0,
                })
                await eventBus.emit('plan.created', { planId: plan.id, name: plan.name, taskCount: plan.tasks.length })
                return { planId: plan.id, taskCount: plan.tasks.length, status: plan.status }
              } catch (err) {
                return { planId: '', taskCount: 0, status: 'failed', error: String(err) }
              }
            }
          : undefined,

        planGet: planStore
          ? async (args) => {
              try {
                const planId = args.planId
                  ?? (await planStore.getActive(args.sessionId))?.id
                if (!planId) return { found: false, text: '', error: 'No plan found' }

                if (args.detail === 'full') {
                  // 返回原始 Markdown——供 LLM 直接分析
                  const md = await planStore.getMarkdown(planId)
                  if (!md) return { found: false, text: '', error: 'No plan found' }
                  return { found: true, text: md }
                }

                // summary: 使用结构化数据生成简要摘要
                const plan = await planStore.get(planId)
                if (!plan) return { found: false, text: '', error: 'No plan found' }
                return { found: true, text: formatPlanSummary(plan) }
              } catch (err) {
                return { found: false, text: '', error: String(err) }
              }
            }
          : undefined,

        planList: planStore
          ? async (args) => {
              try {
                const summaries = args.status
                  ? await planStore.listByStatus(args.status as PlanStatus)
                  : await planStore.listBySession(args.sessionId)
                return {
                  plans: summaries.map(s => ({
                    id: s.id,
                    name: s.name,
                    status: s.status,
                    taskCount: s.taskCount,
                    completedCount: s.completedCount,
                  })),
                }
              } catch (err) {
                return { plans: [], error: String(err) }
              }
            }
          : undefined,

        planUpdate: planStore
          ? async (args) => {
              try {
                const plan = await planStore.get(args.planId)
                if (!plan) return { success: false, text: '', error: `Plan ${args.planId} not found` }

                switch (args.action) {
                  case 'pause':
                    await planStore.update(args.planId, { status: 'paused' })
                    await eventBus.emit('plan.updated', { planId: args.planId, action: 'pause' })
                    return { success: true, text: `Plan ${args.planId} paused` }
                  case 'resume':
                    await planStore.update(args.planId, { status: 'active' })
                    await eventBus.emit('plan.updated', { planId: args.planId, action: 'resume' })
                    return { success: true, text: `Plan ${args.planId} resumed` }
                  case 'complete':
                    await planStore.update(args.planId, { status: 'completed' })
                    await eventBus.emit('plan.completed', { planId: args.planId, name: plan.name })
                    return { success: true, text: `Plan ${args.planId} completed` }
                  case 'cancel':
                    await planStore.update(args.planId, { status: 'cancelled' })
                    await eventBus.emit('plan.updated', { planId: args.planId, action: 'cancel' })
                    return { success: true, text: `Plan ${args.planId} cancelled` }
                  case 'add_tasks': {
                    if (!args.tasks?.length) return { success: false, text: '', error: 'No tasks provided' }
                    const startIdx = plan.tasks.length + 1
                    const newTasks: PlanTask[] = args.tasks.map((t, i) => ({
                      id: `task-${startIdx + i}`,
                      title: t.title,
                      description: t.description,
                      type: t.type as TaskType,
                      status: 'pending' as PlanTaskStatus,
                      dependencies: t.dependencies,
                      files: t.files,
                      estimatedComplexity: t.estimatedComplexity,
                      attempts: 0,
                    }))
                    await planStore.update(args.planId, { tasks: [...plan.tasks, ...newTasks] })
                    await eventBus.emit('plan.updated', { planId: args.planId, action: 'add_tasks' })
                    return { success: true, text: `Added ${newTasks.length} tasks to plan ${args.planId}` }
                  }
                  case 'remove_task': {
                    if (!args.taskId) return { success: false, text: '', error: 'taskId required' }
                    const filtered = plan.tasks.filter(t => t.id !== args.taskId)
                    if (filtered.length === plan.tasks.length) return { success: false, text: '', error: `Task ${args.taskId} not found` }
                    await planStore.update(args.planId, { tasks: filtered })
                    await eventBus.emit('plan.updated', { planId: args.planId, action: 'remove_task' })
                    return { success: true, text: `Removed task ${args.taskId} from plan ${args.planId}` }
                  }
                  case 'update_task': {
                    if (!args.taskId || !args.taskPatch) return { success: false, text: '', error: 'taskId and taskPatch required' }
                    await planStore.updateTask(args.planId, args.taskId, args.taskPatch as Partial<PlanTask>)
                    await eventBus.emit('plan.updated', { planId: args.planId, action: 'update_task' })
                    return { success: true, text: `Updated task ${args.taskId} in plan ${args.planId}` }
                  }
                  default:
                    return { success: false, text: '', error: `Unknown action: ${args.action}` }
                }
              } catch (err) {
                return { success: false, text: '', error: String(err) }
              }
            }
          : undefined,
      }
    },
  }
}

// ═══ Plan-based dispatch helper ═══

import type { DispatchResult, Plan, AgentProfileRegistry as IAgentProfileRegistry } from './types'

async function handlePlanDispatch(
  args: { planId: string; taskId?: string; mode: 'sync' | 'background'; sessionId?: string; sessionMode?: 'ephemeral' | 'sticky'; workflowSlot?: string },
  planStore: PlanStore,
  profileRegistry: IAgentProfileRegistry,
  dispatcher: Dispatcher,
  eventBus: OrchestratorEventBus,
  agentRegistry: AgentRegistry,
  skillAdapter?: SkillAdapter,
): Promise<DispatchResult> {
  const plan = await planStore.get(args.planId)
  if (!plan) {
    return { success: false, error: `Plan ${args.planId} not found` }
  }

  // 文档优先：必须由上层 LLM 基于完整 plan Markdown 显式选定 taskId。
  // 不在宿主侧做“next ready task”调度。
  if (!args.taskId) {
    return {
      success: false,
      error: 'taskId is required for plan-based dispatch. Load full plan Markdown via plan_get(detail="full"), analyze task dependencies, then pass the selected taskId.',
    }
  }
  const task = plan.tasks.find(t => t.id === args.taskId)
  if (!task) return { success: false, error: `Task ${args.taskId} not found in plan ${args.planId}` }

  // 解析 agent profile
  const profile = resolveAgentProfileForTask(task, profileRegistry)
  let delegatedSubagent = ''
  let delegatedWorkflowSlot = args.workflowSlot

  if (!profile) {
    // 回落到 agentRegistry 中的 fallback
    const fallbackSpec = agentRegistry.resolve({ category: task.type })
    if (fallbackSpec) {
      delegatedSubagent = fallbackSpec.name
      delegatedWorkflowSlot = args.workflowSlot
    } else {
      return { success: false, error: `No agent profile found for task type: ${task.type}` }
    }
  } else {
    // 组装 AgentSpec
    const spec = await prepareAgentSpec(profile, plan, task, skillAdapter)

    // 注册临时 agent spec
    agentRegistry.register(spec)
    delegatedSubagent = spec.name
    delegatedWorkflowSlot = args.workflowSlot ?? task.execution?.workflowSlot ?? profile.preferredModelTier
  }

  // 仅做分发事件与实际 dispatch；task 状态由上层 LLM 通过 plan_update 显式维护。
  await eventBus.emit('plan.task_dispatched', {
    planId: args.planId,
    taskId: task.id,
    agentProfile: profile?.name ?? delegatedSubagent,
  })

  // Dispatch
  const result = await dispatcher.dispatch({
    prompt: buildPlanTaskPrompt(plan, task),
    subagent: delegatedSubagent,
    mode: args.mode,
    sessionId: args.sessionId,
    sessionMode: args.sessionMode,
    workflowSlot: delegatedWorkflowSlot,
  })

  await eventBus.emit('plan.task_completed', {
    planId: args.planId,
    taskId: task.id,
    status: result.success ? 'dispatched' : 'dispatch_failed',
  })

  return result
}

function buildPlanTaskPrompt(plan: Plan, task: PlanTask): string {
  const constraints = plan.constraints?.length
    ? plan.constraints.map(c => `- ${c}`).join('\n')
    : '- None'

  return [
    `## Plan Task: ${task.id} - ${task.title}`,
    '',
    '### Plan Context',
    `- Plan ID: ${plan.id}`,
    `- Plan Name: ${plan.name}`,
    `- Goal: ${plan.goal}`,
    `- Architecture: ${plan.architecture ?? 'N/A'}`,
    '',
    '### Constraints',
    constraints,
    '',
    '### Task Metadata',
    `- Type: ${task.type}`,
    `- Dependencies: ${task.dependencies?.length ? task.dependencies.join(', ') : 'none'}`,
    `- Files: ${task.files?.length ? task.files.join(', ') : 'N/A'}`,
    '',
    '### Task Description',
    task.description,
  ].join('\n')
}

function formatPlanSummary(plan: Plan): string {
  const completed = plan.tasks.filter(t => t.status === 'completed' || t.status === 'skipped').length
  const lines = [
    `## Plan: ${plan.name}`,
    `ID: ${plan.id} | Status: ${plan.status} | Progress: ${completed}/${plan.tasks.length}`,
    `Goal: ${plan.goal}`,
    '',
    'Tasks:',
  ]
  for (const t of plan.tasks) {
    const icon = t.status === 'completed' || t.status === 'skipped' ? '[x]'
      : t.status === 'running' ? '[~]'
      : t.status === 'failed' ? '[!]'
      : '[ ]'
    const suffix = t.status === 'ready' ? ' (READY)'
      : t.status === 'running' ? ' (RUNNING)'
      : t.status === 'failed' ? ' (FAILED)'
      : t.status === 'blocked' ? ' (BLOCKED)'
      : ''
    lines.push(`- ${icon} ${t.id}: ${t.title}${suffix}`)
  }
  lines.push('', 'Use plan_get with detail="full" to load the complete plan Markdown for analysis.')
  return lines.join('\n')
}

// ═══ 辅助：批量注册 agent specs ═══

export function registerAgents(
  registry: AgentRegistry,
  specs: AgentSpec[],
  fallback?: AgentSpec,
): void {
  for (const spec of specs) {
    registry.register(spec)
  }
  if (fallback) {
    registry.setFallback(fallback)
  }
}

// ═══ Bootstrap — 一站式创建 + 注册 + 生成回调 ═══

export interface BootstrapOptions extends OrchestratorOptions {
  /** 要注册的 agent 列表 */
  agents?: AgentSpec[]
  /** 当无 agent 匹配时使用的 fallback */
  fallbackAgent?: AgentSpec
}

export interface BootstrapResult {
  orchestrator: Orchestrator
  callbacks: ToolCallbacks
}

/**
 * 一站式初始化：创建 Orchestrator → 注册 agents → 生成 ToolCallbacks。
 *
 * 返回的 callbacks 与 @vitamin/tools RegisterBuiltinOptions 签名兼容，
 * 可直接传给 registerBuiltinTools。
 *
 * @example
 * ```ts
 * const { orchestrator, callbacks } = bootstrapOrchestrator({
 *   sessionFactory,
 *   toolRegistry,
 *   agents: config.agents,
 *   fallbackAgent: { name: 'general', description: 'Fallback', model: 'gpt-4' },
 * })
 * registerBuiltinTools(toolRegistry, projectRoot, callbacks)
 * ```
 */
export function bootstrapOrchestrator(options: BootstrapOptions): BootstrapResult {
  const orchestrator = createOrchestrator(options)

  if (options.agents || options.fallbackAgent) {
    registerAgents(
      orchestrator.agentRegistry,
      options.agents ?? [],
      options.fallbackAgent,
    )
  }

  const callbacks = orchestrator.toToolCallbacks()

  return { orchestrator, callbacks }
}

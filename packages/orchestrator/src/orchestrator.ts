import { createEventBus, bridgeEventBusToHooks } from './events'
import { createAgentRegistry } from './agent-registry'
import { createBackgroundManager } from './background-manager'
import { createDispatcher } from './dispatcher'
import { createPlanLoader, buildStepPrompt } from './plan-loader'
import { createMemoryCheckpointStore } from './checkpoint-store'
import { createMemoryPlanRunStore, createPlanRun, updatePlanRunStep } from './plan-run'

import type { OrchestratorEventBus } from './events'
import type {
  AgentRegistry,
  AgentSpec,
  BackgroundManager,
  Dispatcher,
  OrchestratorOptions,
  SkillAdapter,
} from './types'
import type { PlanLoader } from './plan-loader'
import type { CheckpointStore } from './checkpoint-store'
import type { PlanRun, PlanRunStore } from './plan-run'
import type { ClarifyChannel, ClarifyEscalation, ClarifyReason } from './clarify-channel'
import type { ReviewGate, ReviewContext } from './review-gate'


export interface Orchestrator {
  readonly agentRegistry: AgentRegistry
  readonly dispatcher: Dispatcher
  readonly backgroundManager: BackgroundManager
  readonly eventBus: OrchestratorEventBus
  readonly planLoader: PlanLoader | undefined
  readonly checkpointStore: CheckpointStore | undefined
  readonly clarifyChannel: ClarifyChannel | undefined
  readonly reviewGate: ReviewGate | undefined
  readonly planRunStore: PlanRunStore | undefined

  toToolCallbacks(skillAdapter?: SkillAdapter): ToolCallbacks
}

export interface ToolCallbacks {
  dispatchTask: (args: {
    prompt: string
    subagent?: string
    category?: string
    mode: 'sync' | 'background'
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

  performWork: (name: string) => Promise<{
    success: boolean
    taskId?: string
    message?: string
    error?: Error | string
  }>

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

  // Phase 2: Plan Loader + Checkpoint Store
  const planLoader = options.planFileStore
    ? createPlanLoader(options.planFileStore)
    : undefined
  const checkpointStore = options.checkpointStore
    ?? (options.planFileStore ? createMemoryCheckpointStore() : undefined)

  // Phase 2: PlanRun Store
  const planRunStore = options.planRunStore
    ?? (options.planFileStore ? createMemoryPlanRunStore() : undefined)

  // Phase 3: Clarify Channel + Review Gate
  const clarifyChannel = options.clarifyChannel ?? undefined
  const reviewGate = options.reviewGate ?? undefined

  return {
    agentRegistry,
    dispatcher,
    backgroundManager,
    eventBus,
    planLoader,
    checkpointStore,
    clarifyChannel,
    reviewGate,
    planRunStore,

    toToolCallbacks(skillAdapter?: SkillAdapter): ToolCallbacks {
      const resolvedSkillAdapter = skillAdapter ?? options.skillAdapter
      const noSkill = () =>
        Promise.resolve({ success: false, error: 'SkillAdapter not provided' } as never)

      return {
        dispatchTask: (args) => dispatcher.dispatch(args),
        callAgent: (agent, prompt, opts) => agentRegistry.call(agent, prompt, opts),

        performWork: async (name: string) => {
          if (!planLoader || !options.planFileStore) {
            return {
              success: false,
              message: 'performWork requires a PlanFileStore. Provide planFileStore in OrchestratorOptions.',
              error: 'NO_PLAN_STORE',
            }
          }

          const sessionId = options.sessionId

          try {
            // Load the plan file
            const plan = await planLoader.load(name)
            const nextStep = planLoader.getNextStep(plan.id)

            if (!nextStep) {
              const completed = planLoader.isCompleted(plan.id)
              return {
                success: completed,
                message: completed
                  ? `Plan "${plan.name}" is already fully completed.`
                  : `Plan "${plan.name}" has no pending steps.`,
              }
            }

            // PlanRun: 获取或创建执行实例
            let planRun: PlanRun | undefined
            if (planRunStore) {
              planRun = sessionId
                ? await planRunStore.getActive(plan.id, sessionId)
                : undefined
              if (!planRun) {
                planRun = createPlanRun({
                  planId: plan.id,
                  planPath: name,
                  sessionId: sessionId ?? '',
                  steps: plan.steps.map(s => ({ id: s.id, status: s.status })),
                })
                await planRunStore.save(planRun)
              }
            }

            // Emit plan.started if this is the first step
            const progress = plan.steps.filter(s => s.status === 'completed').length
            if (progress === 0) {
              await eventBus.emit('plan.started', {
                planId: plan.id,
                totalSteps: plan.steps.length,
              })
            }

            // Mark step as in-progress
            planLoader.updateStep(plan.id, nextStep.id, 'in_progress')
            if (planRun && planRunStore) {
              planRun = updatePlanRunStep(planRun, nextStep.id, { status: 'in_progress' })
              planRun.currentStepId = nextStep.id
              await planRunStore.save(planRun)
            }

            // Build the prompt and dispatch as a task
            const prompt = buildStepPrompt(plan, nextStep)
            const result = await dispatcher.dispatch({
              prompt,
              mode: 'sync',
            })

            if (result.success) {
              // ReviewGate: 步骤产出物质量审查
              if (reviewGate && result.output) {
                const reviewContext: ReviewContext = {
                  taskId: result.id ?? '',
                  planId: plan.id,
                  stepId: nextStep.id,
                  output: result.output,
                  prompt,
                }
                const review = await reviewGate.run(reviewContext)
                if (!review.passed) {
                  planLoader.updateStep(plan.id, nextStep.id, 'failed')
                  if (planRun && planRunStore) {
                    planRun = updatePlanRunStep(planRun, nextStep.id, {
                      status: 'failed',
                      taskId: result.id,
                      reviewPassed: false,
                    })
                    planRun.currentStepId = undefined
                    await planRunStore.save(planRun)
                  }
                  const blockerMessages = review.blockers.map(b => b.message).join('; ')
                  return {
                    success: false,
                    message: `Step "${nextStep.title}" failed review: ${blockerMessages}`,
                    error: `REVIEW_FAILED: ${blockerMessages}`,
                  }
                }
              }

              planLoader.updateStep(plan.id, nextStep.id, 'completed')
              if (planRun && planRunStore) {
                planRun = updatePlanRunStep(planRun, nextStep.id, {
                  status: 'completed',
                  taskId: result.id,
                  output: result.output?.slice(0, 500),
                  reviewPassed: reviewGate ? true : undefined,
                })
                planRun.currentStepId = undefined
              }

              const remaining = plan.steps.filter(s => s.status === 'pending').length - 1
              await eventBus.emit('plan.step_completed', {
                planId: plan.id,
                stepId: nextStep.id,
                remaining: Math.max(0, remaining),
              })

              // Save checkpoint (with sessionId)
              if (checkpointStore) {
                await checkpointStore.save({
                  id: crypto.randomUUID(),
                  taskId: result.id ?? crypto.randomUUID(),
                  sessionId,
                  planId: plan.id,
                  stepId: nextStep.id,
                  task: (await dispatcher.get(result.id ?? ''))!,
                  metadata: { stepTitle: nextStep.title },
                  createdAt: Date.now(),
                })
              }

              // Check if all steps complete
              const updatedPlan = planLoader.getPlan(plan.id)
              if (updatedPlan && updatedPlan.steps.every(s => s.status === 'completed')) {
                await eventBus.emit('plan.completed', { planId: plan.id })
                if (planRun) {
                  planRun.status = 'completed'
                  planRun.completedAt = Date.now()
                }
              }

              // Persist PlanRun
              if (planRun && planRunStore) {
                await planRunStore.save(planRun)
              }

              // Persist progress (markdown checkboxes)
              const currentPlan = planLoader.getPlan(plan.id)
              if (currentPlan) {
                await planLoader.save(currentPlan)
              }

              return {
                success: true,
                taskId: result.id,
                message: `Step "${nextStep.title}" completed. ${Math.max(0, remaining)} steps remaining.`,
              }
            } else {
              planLoader.updateStep(plan.id, nextStep.id, 'failed')
              if (planRun && planRunStore) {
                planRun = updatePlanRunStep(planRun, nextStep.id, {
                  status: 'failed',
                  taskId: result.id,
                })
                planRun.currentStepId = undefined
                await planRunStore.save(planRun)
              }
              return {
                success: false,
                message: `Step "${nextStep.title}" failed: ${result.error}`,
                error: result.error,
              }
            }
          } catch (err) {
            return {
              success: false,
              message: `Failed to load or execute plan: ${String(err)}`,
              error: String(err),
            }
          }
        },

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
      }
    },
  }
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

// ═══════════════════════════════════════════════════════════
// @vitamin/orchestrator — Orchestrator 组合根
// ═══════════════════════════════════════════════════════════
// 把 AgentRegistry, Dispatcher, BackgroundManager 组装成一体
// 提供统一的创建入口 + callback 绑定辅助

import { createEventBus } from './events'
import { createAgentRegistry } from './agent-registry'
import { createBackgroundManager } from './background-manager'
import { createDispatcher } from './dispatcher'

import type { OrchestratorEventBus } from './events'
import type {
  AgentRegistry,
  AgentSpec,
  BackgroundManager,
  Dispatcher,
  OrchestratorOptions,
  SkillAdapter,
} from './types'

// ═══ Orchestrator 实例 ═══

export interface Orchestrator {
  readonly agentRegistry: AgentRegistry
  readonly dispatcher: Dispatcher
  readonly backgroundManager: BackgroundManager
  readonly eventBus: OrchestratorEventBus

  /**
   * 生成 registerBuiltinTools 所需的 callbacks 对象，
   * 对齐 @vitamin/tools RegisterBuiltinOptions 签名。
   */
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
}

// ═══ 创建 Orchestrator ═══

export function createOrchestrator(options: OrchestratorOptions): Orchestrator {
  const eventBus = createEventBus()

  const agentRegistry = createAgentRegistry({
    sessionFactory: options.sessionFactory,
    toolRegistry: options.toolRegistry,
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
  })

  return {
    agentRegistry,
    dispatcher,
    backgroundManager,
    eventBus,

    toToolCallbacks(skillAdapter?: SkillAdapter): ToolCallbacks {
      const resolvedSkillAdapter = skillAdapter ?? options.skillAdapter
      const noSkill = () =>
        Promise.resolve({ success: false, error: 'SkillAdapter not provided' } as never)

      return {
        dispatchTask: (args) => dispatcher.dispatch(args),
        callAgent: (agent, prompt, opts) => agentRegistry.call(agent, prompt, opts),
        // Phase 2: performWork 将加载 Markdown 计划文件，提取 task/chunk 上下文，
        // 并在计划协议约束下驱动子任务派发与状态跟踪（参照 superpowers 模式）。
        // 当前返回显式 NOT_IMPLEMENTED 错误，不会静默吞掉调用。
        performWork: async (_name) => {
          return {
            success: false,
            message: 'performWork requires plan protocol support (Phase 2). Use dispatchTask for task delegation.',
            error: 'NOT_IMPLEMENTED',
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

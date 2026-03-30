// ═══════════════════════════════════════════════════════════
// @vitamin/orchestrator — 核心类型定义
// ═══════════════════════════════════════════════════════════

// ═══ Task 数据模型 ═══

export type TaskStatus = 'pending' | 'running' | 'waiting_review' | 'completed' | 'failed' | 'cancelled'
export type TaskKind = 'delegate' | 'agent_call' | 'plan' | 'adhoc'
export type TaskMode = 'sync' | 'background'
export type ChildSessionMode = 'ephemeral' | 'sticky'

export interface TaskInput {
  prompt: string
  subagent?: string
  category?: string
  planRef?: string
  sessionId?: string
  sessionMode?: ChildSessionMode
  /** Workflow slot — 用于 ModelSelector 确定该任务的模型 */
  workflowSlot?: string
}

export interface TaskOutput {
  text: string
  artifacts?: Record<string, unknown>
  summary?: string
}

export interface TaskError {
  code: string
  message: string
  retriable: boolean
}

export interface OrchestratorTask {
  id: string
  kind: TaskKind
  status: TaskStatus
  mode: TaskMode
  input: TaskInput
  output?: TaskOutput
  error?: TaskError
  attempts: number
  maxAttempts: number
  parentTaskId?: string
  correlationId: string
  createdAt: number
  startedAt?: number
  endedAt?: number
}

// ═══ Agent Spec ═══

export interface AgentSpec {
  name: string
  description: string
  model: string
  systemPrompt?: string
  tools?: string[]
  capabilities?: string[]
  maxToolTurns?: number
  /** 可选：agent 级别的 workflow slot → 模型映射 */
  modelSlots?: Record<string, string>
}

// ═══ Subagent Result ═══

export type SubagentResultStatus = 'done' | 'done_with_concerns' | 'needs_context' | 'blocked'

export interface SubagentResult {
  status: SubagentResultStatus
  output: string
  concerns?: string
  missingContext?: string
  blockReason?: string
  changedFiles?: string[]
  verificationPerformed?: string
  risksOrConcerns?: string
}

// ═══ Model Selector ═══

export interface ModelSelector {
  selectModel(task: OrchestratorTask, spec: AgentSpec): string | undefined
}

// ═══ Dispatch ═══

export type DispatchMode = 'sync' | 'background'

export interface DispatchArgs {
  prompt: string
  subagent?: string
  category?: string
  mode: DispatchMode
  sessionId?: string
  sessionMode?: ChildSessionMode
  /** Workflow slot — 传递给 ModelSelector */
  workflowSlot?: string
}

export interface DispatchResult {
  success: boolean
  output?: string
  id?: string
  status?: string
  error?: string
}

// ═══ AgentRegistry 接口 ═══

export interface AgentRegistry {
  register(spec: AgentSpec): void
  get(name: string): AgentSpec | undefined
  resolve(query: { name?: string; category?: string }): AgentSpec | undefined
  list(): AgentSpec[]
  call(
    agent: string,
    prompt: string,
    options?: { mode?: 'sync' | 'async'; sessionId?: string },
  ): Promise<{ success: boolean; output?: string; error?: string }>
  setFallback(spec: AgentSpec): void
  setBackgroundManager(bgm: BackgroundManager): void
}

// ═══ Dispatcher 接口 ═══

export interface Dispatcher {
  dispatch(args: DispatchArgs): Promise<DispatchResult>

  create(args: {
    prompt: string
    category?: string
    subagent?: string
    sessionId?: string
    sessionMode?: ChildSessionMode
  }): Promise<{
    id: string
    success: boolean
    message?: string
    error?: string
  }>

  get(id: string): Promise<OrchestratorTask | undefined>

  list(status?: string): Promise<{
    success: boolean
    tasks: Array<{ id: string; prompt: string; status: string }>
    error?: string
  }>

  update(
    id: string,
    action: 'cancel' | 'retry',
  ): Promise<{
    success: boolean
    message: string
  }>
}

// ═══ BackgroundManager 接口 ═══

export interface BackgroundManager {
  submit(task: OrchestratorTask, spec: AgentSpec): Promise<string>

  getOutput(id: string): Promise<{
    status: string
    success: boolean
    output?: string
    error?: string
  }>

  cancel(id: string): Promise<{
    success: boolean
    error?: string
  }>

  list(): OrchestratorTask[]
}

// ═══ SkillAdapter 接口 ═══

export interface SkillAdapter {
  load(path: string): Promise<{
    success: boolean
    name?: string
    error?: string
  }>

  execute(
    name: string,
    input?: string,
    parameters?: Record<string, string>,
  ): Promise<{
    success: boolean
    output?: string
    error?: string
  }>

  /** 获取已加载 skill 的上下文文本（instructions + checklist），用于注入 AgentSpec system prompt */
  getContext?(name: string): Promise<string | undefined>
}

// ═══ Plan 数据模型（v2） ═══

export type PlanStatus = 'draft' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type PlanTaskStatus = 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'skipped' | 'blocked'

export type TaskType =
  | 'code_generation'
  | 'code_modification'
  | 'refactoring'
  | 'testing'
  | 'debugging'
  | 'research'
  | 'documentation'
  | 'review'
  | 'infrastructure'
  | 'custom'

export interface PlanTaskOutput {
  summary: string
  text?: string
  artifacts?: Record<string, unknown>
  subagentResultStatus?: SubagentResultStatus
}

export interface PlanTaskError {
  code: string
  message: string
  retriable?: boolean
}

export interface TaskExecutionSpec {
  agentProfile?: string
  requiredSkills?: string[]
  tools?: string[]
  workflowSlot?: string
  modelTier?: 'fast' | 'standard' | 'powerful'
  maxToolTurns?: number
  systemPromptAddendum?: string
  generatedAt?: number
}

export interface PlanTask {
  id: string
  title: string
  description: string
  type: TaskType
  status: PlanTaskStatus
  dependencies?: string[]
  files?: string[]
  estimatedComplexity?: 'low' | 'medium' | 'high'
  execution?: TaskExecutionSpec
  output?: PlanTaskOutput
  error?: PlanTaskError
  attempts: number
  startedAt?: number
  completedAt?: number
}

export interface Plan {
  id: string
  version: number
  name: string
  goal: string
  constraints?: string[]
  architecture?: string
  tasks: PlanTask[]
  status: PlanStatus
  sessionId: string
  createdAt: number
  updatedAt: number
  completedAt?: number
  metadata?: Record<string, unknown>
}

export interface PlanSummary {
  id: string
  name: string
  status: PlanStatus
  taskCount: number
  completedCount: number
  createdAt: number
  updatedAt: number
}

// ═══ PlanStore 接口 ═══

export interface PlanStore {
  create(plan: Plan): Promise<Plan>
  get(planId: string): Promise<Plan | undefined>
  update(planId: string, patch: Partial<Plan>): Promise<Plan>
  delete(planId: string): Promise<boolean>

  listBySession(sessionId: string): Promise<PlanSummary[]>
  listByStatus(status: PlanStatus): Promise<PlanSummary[]>
  getActive(sessionId: string): Promise<Plan | undefined>

  updateTask(planId: string, taskId: string, patch: Partial<PlanTask>): Promise<Plan>
  getReadyTasks(planId: string): Promise<PlanTask[]>

  getVersion(planId: string): Promise<number>

  /** 获取原始 Markdown 文本——供恢复时直接注入 LLM 上下文 */
  getMarkdown(planId: string): Promise<string | undefined>
}

// ═══ RegisteredAgentProfile（静态注册模板） ═══

export interface RegisteredAgentProfile {
  name: string
  taskTypes: TaskType[]
  capabilities: string[]
  systemPromptTemplate: string
  defaultTools?: string[]
  preferredModelTier: 'fast' | 'standard' | 'powerful'
  defaultMaxToolTurns: number
  thinkingLevel?: 'low' | 'medium' | 'high'
}

// ═══ AgentProfileRegistry 接口 ═══

export interface AgentProfileRegistry {
  register(profile: RegisteredAgentProfile): void
  get(name: string): RegisteredAgentProfile | undefined
  resolve(query: { name?: string; category?: string }): RegisteredAgentProfile | undefined
  list(): RegisteredAgentProfile[]
}

// ═══ 依赖注入接口 (不直接依赖 @vitamin/coding) ═══

export interface SessionFactory {
  createSession(options?: {
    id?: string
    model?: { provider: string; name: string; api?: string } | string
    systemPrompt?: string
    tools?: unknown[]
    maxToolTurns?: number
    workspaceDir?: string
  }): Promise<AgentSessionHandle>

  removeSession(id: string): Promise<boolean>

  /**
   * Phase 2: 按 id 获取已有会话，用于 sessionId 跨调用上下文复用。
   * Phase 1 不要求实现。
   */
  getSession?(id: string): AgentSessionHandle | undefined
}

export interface AgentSessionHandle {
  readonly id: string
  readonly status: string
  prompt(text: string): Promise<void>
  abort(): void
  getLastAssistantText(): string | undefined
}

// ═══ Orchestrator 创建选项 ═══

export interface OrchestratorOptions {
  sessionFactory: SessionFactory
  toolRegistry: ToolRegistryHandle
  hooks?: HookRegistryHandle
  maxConcurrent?: number
  skillAdapter?: SkillAdapter
  /** Checkpoint 存储 (不提供时不启用) */
  checkpointStore?: import('./checkpoint-store').CheckpointStore
  /** Phase 3: 澄清通道 (提供后 clarifyRequest 工具可用) */
  clarifyChannel?: import('./clarify-channel').ClarifyChannel
  /** Phase 3: 质量门禁 */
  reviewGate?: import('./review-gate').ReviewGate
  /** Phase 3: 重试策略 (不提供时使用默认 exponential backoff) */
  retryStrategy?: import('./retry-strategy').RetryStrategy
  /** Phase 3: 熔断器 (不提供时不启用熔断) */
  circuitBreaker?: import('./retry-strategy').CircuitBreaker
  /** Phase 3: 组合路由器 (提供后 AgentRegistry.resolve 使用策略路由) */
  router?: import('./routing-strategy').CompositeRouter
  /** 自适应模型选择器 (提供后 dispatcher 根据任务特征动态选择模型) */
  modelSelector?: ModelSelector
  /** Plan 持久化存储 (提供后 plan_* 工具可用) */
  planStore?: PlanStore
  /** Agent Profile 注册表 (提供后 plan dispatch 使用 profile 路由) */
  agentProfileRegistry?: AgentProfileRegistry
}

export interface ToolRegistryHandle {
  filterByNames(names: string[]): unknown[]
  getAvailable(preset?: string): unknown[]
}

export interface HookRegistryHandle {
  emit(timing: string, input: unknown): Promise<void>
}

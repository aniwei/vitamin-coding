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
  /** Phase 2: 计划文件存储后端 (提供后 performWork 可用) */
  planFileStore?: import('./plan-loader').PlanFileStore
  /** Phase 2: Checkpoint 存储 (不提供时使用内存实现) */
  checkpointStore?: import('./checkpoint-store').CheckpointStore
  /** Phase 2: PlanRun 执行态存储 (不提供时使用内存实现) */
  planRunStore?: import('./plan-run').PlanRunStore
  /** 当前会话 ID（用于关联 PlanRun / Checkpoint） */
  sessionId?: string
  /** Phase 3: 澄清通道 (提供后 clarifyRequest 工具可用) */
  clarifyChannel?: import('./clarify-channel').ClarifyChannel
  /** Phase 3: 质量门禁 (提供后 performWork 步骤完成后自动执行 review) */
  reviewGate?: import('./review-gate').ReviewGate
  /** Phase 3: 重试策略 (不提供时使用默认 exponential backoff) */
  retryStrategy?: import('./retry-strategy').RetryStrategy
  /** Phase 3: 熔断器 (不提供时不启用熔断) */
  circuitBreaker?: import('./retry-strategy').CircuitBreaker
  /** Phase 3: 组合路由器 (提供后 AgentRegistry.resolve 使用策略路由) */
  router?: import('./routing-strategy').CompositeRouter
  /** 自适应模型选择器 (提供后 dispatcher 根据任务特征动态选择模型) */
  modelSelector?: ModelSelector
}

export interface ToolRegistryHandle {
  filterByNames(names: string[]): unknown[]
  getAvailable(preset?: string): unknown[]
}

export interface HookRegistryHandle {
  emit(timing: string, input: unknown): Promise<void>
}

export type TaskStatus =
  | 'pending'      // 已创建，等待执行
  | 'running'      // 正在执行中
  | 'completed'    // 成功完成
  | 'failed'       // 执行失败
  | 'cancelled'    // 已取消

// 对齐 task_delegate / task_create / agent_call 参数 ═══
export interface TaskInput {
  /** 发给 subagent 的提示 */
  prompt: string
  /** 指定 agent 名称 — 对齐 task_delegate.subagent / agent_call.agent */
  subagent?: string
  /** 任务类别 — 对齐 task_delegate.category / task_create.category */
  category?: string
  /** 关联的 plan ID（plan 分发模式） */
  planId?: string
  /** plan 内的 task ID（plan 分发模式） */
  taskId?: string
  /** 复用的 session ID */
  sessionId?: string
  /** session 策略 — 对齐 task_delegate.sessionMode */
  sessionMode?: 'ephemeral' | 'sticky'
  /** 执行模式 — 对齐 task_delegate.mode */
  mode?: 'sync' | 'background'
}

export interface TaskOutput {
  text: string
  summary?: string
  tokenUsage?: { input: number; output: number; cacheRead: number }
  durationMs?: number
}

export interface TaskError {
  code: string
  message: string
  retriable: boolean
}

export interface Task {
  id: string
  parentId?: string
  status: TaskStatus
  sessionPolicy: 'ephemeral' | 'sticky'
  sessionId?: string
  attempts: number
  maxAttempts: number
  input: TaskInput
  output?: TaskOutput
  error?: TaskError
  createdAt: number
  completedAt?: number
}

export interface OrchestratorOptions {
  /** WorkflowConfig (retry / circuit_breaker 等) */
  workflowConfig?: WorkflowConfig
  /** 最大同时活跃任务 */
  maxActiveTasks?: number
  /** 最大后台任务 */
  maxBackgroundTasks?: number
  /** 默认最大重试次数 */
  defaultMaxAttempts?: number
}

export interface WorkflowConfig {
  enabled?: boolean
  review?: {
    enabled?: boolean
  }
  retry?: {
    enabled?: boolean
    max_attempts?: number
  }
  circuit_breaker?: {
    enabled?: boolean
    failure_threshold?: number
    reset_timeout_ms?: number
  }
  routing?: {
    enabled?: boolean
  }
}

// ═══ Fleet — Phase 2 ═══
export type FleetStrategy = 'fan_out_fan_in' | 'race'

export interface FleetSpec {
  id: string
  strategy: FleetStrategy
  members: FleetMember[]
  maxConcurrency?: number
  timeoutMs?: number
}

export interface FleetMember {
  label: string
  input: TaskInput
}

export interface FleetResult {
  fleetId: string
  strategy: FleetStrategy
  memberResults: Map<string, TaskOutput | TaskError>
  aggregated?: TaskOutput
  durationMs: number
}

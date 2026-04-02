import type { HookRegistry } from '@vitamin/hooks'
import type { RunSessionOptions, RunSessionResult } from './executor'

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
  /** 模型槽位 — 对齐 task_delegate.slot / agent_call.slot */
  slot?: 'normal' | 'thinking' | 'compact' | 'critique' | 'vision'
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
  hookRegistry: HookRegistry
  /** 由 VitaminApp 注入：创建子 session → prompt → 提取输出文本 */
  runSession: (options: RunSessionOptions) => Promise<RunSessionResult>
  /** 可选：外部 abort 回调 */
  abortTask?: (taskId: string) => void
  workflowConfig?: WorkflowOptions
  maxActiveTasks?: number
  maxBackgroundTasks?: number
  defaultMaxAttempts?: number
}

export interface WorkflowOptions {
  enabled?: boolean
  review?: {
    enabled?: boolean
  }
  retry?: {
    enabled?: boolean
    maxAttempts?: number
  }
  circuitBreaker?: {
    enabled?: boolean
    failureThreshold?: number
    timeoutMs?: number
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

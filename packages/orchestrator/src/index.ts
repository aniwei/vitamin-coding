// @vitamin/orchestrator — 公共导出

// 类型
export type {
  Task,
  TaskStatus,
  TaskInput,
  TaskOutput,
  TaskError,
  OrchestratorOptions,
  WorkflowConfig,
  FleetStrategy,
  FleetSpec,
  FleetMember,
  FleetResult,
} from './types'

// TaskStore
export { TaskStore } from './task-store'

// Orchestrator
export { Orchestrator } from './orchestrator'
export type { OrchestratorDeps } from './orchestrator'

// Executor 类型（供外部实现 runSession 时使用）
export type { RunSessionOptions, RunSessionResult } from './executor'

// 重试 + 熔断
export { RetryPolicy, CircuitBreaker } from './retry'
export type { RetryConfig, CircuitBreakerConfig } from './retry'

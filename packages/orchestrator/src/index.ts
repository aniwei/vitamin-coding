// @vitamin/orchestrator

// ═══ 核心类型 ═══
export type {
  TaskStatus,
  TaskKind,
  TaskMode,
  TaskInput,
  TaskOutput,
  TaskError,
  OrchestratorTask,
  AgentSpec,
  SubagentResultStatus,
  SubagentResult,
  DispatchMode,
  DispatchArgs,
  DispatchResult,
  AgentRegistry,
  Dispatcher,
  BackgroundManager,
  SkillAdapter,
  SessionFactory,
  AgentSessionHandle,
  OrchestratorOptions,
  ToolRegistryHandle,
  HookRegistryHandle,
} from './types'

// ═══ 事件系统 ═══
export { OrchestratorEventBus, createEventBus } from './events'
export type {
  OrchestratorEventMap,
  OrchestratorEventType,
  OrchestratorEventHandler,
} from './events'

// ═══ Agent 注册表 ═══
export { createAgentRegistry } from './agent-registry'

// ═══ 后台任务管理 ═══
export { createBackgroundManager } from './background-manager'

// ═══ 调度器 ═══
export { createDispatcher } from './dispatcher'

// ═══ 组合根 ═══
export { createOrchestrator, registerAgents, bootstrapOrchestrator } from './orchestrator'
export type { Orchestrator, ToolCallbacks, BootstrapOptions, BootstrapResult } from './orchestrator'

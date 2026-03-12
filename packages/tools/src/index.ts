// @vitamin/tools — 工具系统

// 工具注册表
export { ToolRegistry, createToolRegistry } from './tool-registry'

// 工具验证器
export { validateToolArgs } from './tool-validator'
export type { ValidationResult } from './tool-validator'


// standard 预设 (6 个搜索/导航/编排工具)
export type { TaskDispatch, TaskDispatchResult } from './orchestration/task-delegate'

// full 预设 - 编排工具
export type { StartWork } from './orchestration/perform-work'
export type { GetBackgroundOutput } from './orchestration/background-task-output'
export type { CancelBackground } from './orchestration/background-task-cancel'
export type { CallAgent } from './orchestration/agent-call'

// full 预设 - 会话管理
export type { SessionManager } from './session/session-manager'

// full 预设 - 任务管理
export type { CreateTask } from './orchestration/task-create'
export type { GetTask } from './orchestration/task-get'
export type { ListTasks } from './orchestration/task-list'
export type { UpdateTask } from './orchestration/task-update'

// 注册辅助
export type { RegisterBuiltinOptions } from './register-builtin'

// 类型
export type {
  ToolPreset,
  ToolMetadata,
  RegisteredTool,
  ToolRegistrationOptions,
  ToolFactory,
  ToolContext,
} from './types'

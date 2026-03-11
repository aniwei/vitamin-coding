// @vitamin/tools — 工具系统

// 工具注册表
export { ToolRegistry, createToolRegistry } from './tool-registry'

// 工具验证器
export { validateToolArgs } from './tool-validator'
export type { ValidationResult } from './tool-validator'

// minimal 预设 (4 个基础工具)
export { createReadTool } from './builtin/read'
export { createWriteTool } from './builtin/write'
export { createEditTool } from './builtin/edit'
export { createBashTool } from './builtin/bash'

// standard 预设 (6 个搜索/导航/编排工具)
export { createGrepTool } from './builtin/grep'
export { createGlobTool } from './builtin/glob'
export { createFindTool } from './builtin/find'
export { createLsTool } from './builtin/ls'
export { createAstGrepTool } from './builtin/ast-grep'
export { createDelegateTaskTool } from './orchestration/delegate-task'
export type { TaskDispatch, TaskDispatchResult } from './orchestration/delegate-task'

// full 预设 - builtin 高级工具
export { createEditDiffTool } from './builtin/edit-diff'
export { createLookAtTool } from './builtin/look-at'
export { createInteractiveBashTool } from './builtin/interactive-bash'
export { createHashlineEditTool, hashLine } from './builtin/hashline-edit'

// full 预设 - 编排工具
export { createStartWorkTool } from './orchestration/start-work'
export type { StartWork } from './orchestration/start-work'
export { createBackgroundOutputTool } from './orchestration/background-output'
export type { GetBackgroundOutput } from './orchestration/background-output'
export { createBackgroundCancelTool } from './orchestration/background-cancel'
export type { CancelBackground } from './orchestration/background-cancel'
export { createCallAgentTool } from './orchestration/call-agent'
export type { CallAgent } from './orchestration/call-agent'

// full 预设 - Skill 工具
export { createSkillExecutorTool } from './skill/skill-executor'
export type { ExecuteSkill } from './skill/skill-executor'
export { createSkillMcpTool } from './skill/skill-mcp'
export type { CallSkillMcp } from './skill/skill-mcp'
export { createSkillLoaderTool } from './skill/skill-loader'
export type { LoadSkill } from './skill/skill-loader'

// full 预设 - 会话管理
export { createSessionManagerTool } from './session/session-manager'
export type { SessionManager } from './session/session-manager'

// full 预设 - 任务管理
export { createTaskCreateTool } from './task/task-create'
export type { CreateTask } from './task/task-create'
export { createTaskGetTool } from './task/task-get'
export type { GetTask } from './task/task-get'
export { createTaskListTool } from './task/task-list'
export type { ListTasks } from './task/task-list'
export { createTaskUpdateTool } from './task/task-update'
export type { UpdateTask } from './task/task-update'

// 注册辅助
export { registerBuiltinTools } from './register-builtin'
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

// @vitamin/tools — 工具系统

// 工具注册表
export { ToolRegistry, createToolRegistry } from './tool-registry'

// MCP
export { McpManager, createMcpManager, McpClient, createMcpClient } from './mcp'
export { createMcpToolAdapter, createMcpToolAdapters } from './mcp'
export type {
  McpManagerOptions,
  McpClientOptions,
  McpServerConfig,
  McpToolDefinition,
  McpClientStatus,
  McpServerInfo,
} from './mcp'

// 工具验证器
export { validateToolArgs } from './tool-validator'
export type { ValidationResult } from './tool-validator'


export type { TaskDispatch } from './orchestration/task-delegate'

export type { PerformWork } from './orchestration/perform-work'
export type { GetBackgroundOutput } from './orchestration/background-task-output'
export type { CancelBackground } from './orchestration/background-task-cancel'
export type { CallAgent } from './orchestration/agent-call'
export type { SessionManager } from './session/session-manager'
export type { CreateTask } from './orchestration/task-create'
export type { GetTask } from './orchestration/task-get'
export type { ListTasks } from './orchestration/task-list'
export type { UpdateTask } from './orchestration/task-update'

// 注册辅助
export type { RegisterBuiltinOptions } from './register-builtin'

// Skill 工具入口类型（资源域逻辑已迁至 @vitamin/coding）
export type { LoadSkill } from './skill/skill-load'
export type { ExecuteSkill } from './skill/skill-execute'

// 类型
export type {
  ToolPreset,
  ToolMetadata,
  RegisteredTool,
  ToolRegistrationOptions,
  ToolFactory,
} from './types'

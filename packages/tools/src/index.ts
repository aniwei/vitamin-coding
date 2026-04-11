// @vitamin/tools — 工具系统

// 工具注册表
export { ToolRegistry, createToolRegistry } from './tool-registry'

// 注册辅助
export { registerBuiltinTools } from './register-builtin'
export type { RegisterBuiltinOptions } from './register-builtin'

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

// 编排回调类型
export type { TaskDispatch } from './orchestration/task-delegate'
export type { GetBackgroundOutput } from './orchestration/background-task-output'
export type { CancelBackground } from './orchestration/background-task-cancel'
export type { CallAgent } from './orchestration/agent-call'
export type { CreateTask } from './orchestration/task-create'
export type { GetTask } from './orchestration/task-get'
export type { ListTasks } from './orchestration/task-list'
export type { UpdateTask } from './orchestration/task-update'
export type { ClarifyRequest } from './orchestration/clarify-request'
export { createWriteTodos } from './orchestration/write-todos'
export type { WriteTodos, TodoItem } from './orchestration/write-todos'
export { createCaptureFileState } from './orchestration/capture-file-state'
export type { CaptureFileState } from './orchestration/capture-file-state'
export { createLearn } from './orchestration/learn'
export type { LearnCallback } from './orchestration/learn'

// Web 工具
export { createWebFetch } from './web/fetch'
export { createWebSearch } from './web/search'

// 会话管理
export { createSessionManager } from './session/session-manager'
export type { SessionManager } from './session/session-manager'

// Skill 工具入口（运行时已迁移至 @vitamin/coding）
export type { LoadSkill } from './skill/skill-load'
export type { ExecuteSkill } from './skill/skill-execute'

// LSP 工具
export {
  createLspDefinition,
  createLspReferences,
  createLspSymbols,
  createLspDiagnostics,
  createLspPrepareRename,
  createLspRename,
} from './lsp'
export { withLspClient, findWorkspaceRoot } from './lsp'
export { LSPClient, lspManager } from './lsp'
export type {
  LSPServerConfig,
  Location,
  LocationLink,
  SymbolInfo,
  DocumentSymbol,
  Diagnostic as LspDiagnostic,
  WorkspaceEdit,
  PrepareRenameResult,
  ServerLookupResult,
  ResolvedServer,
} from './lsp'

// 注册表类型
export type {
  ToolPreset,
  ToolMetadata,
  RegisteredTool,
  ToolRegistrationOptions,
  ToolFactory,
} from './types'

// Binary 工具执行器
export {
  BinaryToolExecutorRegistry,
  createBinaryToolExecutorRegistry,
} from './binary/binary-executor-registry'

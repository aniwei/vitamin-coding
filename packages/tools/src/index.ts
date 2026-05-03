// @x-mars/tools — 工具系统

// 工具注册表
export { ToolRegistry, createToolRegistry } from './tool-registry'

// 注册辅助
export { registerBuiltinTools } from './register-builtin'
export type { RegisterBuiltinOptions } from './register-builtin'

// MCP
export { McpManager, createMcpManager, McpClient, createMcpClient } from './mcp'
export {
  createMcpToolAdapter,
  createMcpToolAdapters,
  createMcpAgentTools,
  createMcpListResourcesTool,
  createMcpReadResourceTool,
  createMcpListPromptsTool,
  createMcpGetPromptTool,
} from './mcp'
export type {
  McpManagerOptions,
  McpClientOptions,
  McpServerConfig,
  McpToolDefinition,
  McpClientStatus,
  McpServerInfo,
  McpResource,
  McpResourceContents,
  McpPrompt,
  McpPromptMessage,
} from './mcp'

// 工具验证器
export { validateToolArgs } from './tool-validator'
export type { ValidationResult } from './tool-validator'

// Plugin manifest
export {
  validatePluginManifest,
  summarizePluginManifest,
  getPluginLoadErrors,
  buildPluginRuntimePlan,
  discoverPluginManifests,
  applyPluginRuntimePlan,
  disablePluginRuntimePlan,
} from './plugin-manifest'
export {
  PluginManager,
  createPluginManager,
  importPluginTool,
  importPluginHook,
} from './plugin-manager'
export type { PluginManagerOptions, PluginManagerDiagnostics, LoadedPlugin } from './plugin-manager'
export { createFilePluginStateStore, normalizePluginState } from './plugin-state-store'
export type {
  PluginState,
  PluginStateStore,
  FilePluginStateStoreOptions,
} from './plugin-state-store'
export { importClaudeCodePlugin } from './claude-code-compat'
export type {
  ClaudeCodePluginImportOptions,
  ClaudeCodePluginImportReport,
  ClaudeCodePluginImportResult,
} from './claude-code-compat'
export {
  DEFAULT_PLUGIN_CONFIRM_FLAG,
  applyPluginCommandArgumentDefaults,
  buildPluginCommandInvocation,
  consumePluginConfirmationFlag,
  formatPluginCommandInvalidArguments,
  formatPluginCommandInvocationError,
  formatPluginCommandMissingArguments,
  formatPluginCommandUnexpectedArguments,
  formatPluginCommandUsage,
  getInvalidPluginCommandArguments,
  getMissingPluginCommandArguments,
  getUnexpectedPluginCommandArguments,
} from './plugin-command-invocation'
export type {
  PluginCommandHandler,
  PluginCommandHandlerContext,
  PluginCommandHandlerResult,
} from './plugin-command-handler'
export type {
  BuildPluginCommandInvocationOptions,
  InvalidPluginCommandArgument,
  PluginCommandArgumentValue,
  PluginCommandInvocation,
  PluginCommandInvocationError,
  PluginCommandInvocationResult,
} from './plugin-command-invocation'
export {
  PluginCommandRegistry,
  PluginAgentRegistry,
  createPluginCommandRegistry,
  createPluginAgentRegistry,
} from './plugin-command-registry'
export type { PluginCommandRegistration, PluginAgentRegistration } from './plugin-command-registry'
export type {
  PluginManifest,
  PluginManifestStatus,
  PluginPermission,
  PluginToolManifest,
  PluginSkillManifest,
  PluginMcpManifest,
  PluginHookManifest,
  PluginCommandManifest,
  PluginCommandArgumentManifest,
  PluginAgentManifest,
  PluginDevtoolsPanelManifest,
  PluginDevtoolsProviderManifest,
  PluginDevtoolsActionManifest,
  PluginDevtoolsManifest,
  PluginLogSinkManifest,
  PluginLogFormatterManifest,
  PluginLogViewerManifest,
  PluginLogsManifest,
  PluginManifestValidation,
  PluginManifestSummary,
  PluginRuntimePlan,
  PluginLifecycleStepType,
  PluginLifecycleStepStatus,
  PluginLifecycleStep,
  PluginLifecycleResult,
  PluginLifecycleAdapters,
  DiscoveredPluginManifest,
  PluginDiscoveryResult,
} from './plugin-manifest'

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
export { createToolOutputRead } from './orchestration/tool-output-read'
export type { ToolOutputReadArgs } from './orchestration/tool-output-read'
export { createAgentList } from './orchestration/agent-list'
export type { AgentListEntry, ListAgents } from './orchestration/agent-list'
export { createAgentCancel } from './orchestration/agent-cancel'
export type { AgentCancelResult, CancelAgent } from './orchestration/agent-cancel'

// Web 工具
export { createWebFetch, nativeWebFetchProvider } from './web/fetch'
export type {
  WebFetchOptions,
  WebFetchProvider,
  WebFetchProviderInput,
  WebFetchProviderOutput,
} from './web/fetch'
export { createWebSearch, braveHtmlSearchProvider } from './web/search'
export type {
  SearchResult,
  WebSearchOptions,
  WebSearchProvider,
  WebSearchProviderInput,
  WebSearchProviderOutput,
} from './web/search'

// 会话管理
export { createSessionManager } from './session/session-manager'
export type { SessionManager } from './session/session-manager'
export { createSessionSearch } from './session/session-search'
export type {
  SearchSessions,
  SessionSearchMatch,
  SessionSearchResult,
} from './session/session-search'

// Programmatic tool calling
export { createExecuteCode } from './code'
export type {
  ProgrammaticToolCall,
  ProgrammaticToolCallResult,
  ProgrammaticToolInvoker,
} from './code'

// Skill 工具入口（运行时已迁移至 @x-mars/coding）
export type { LoadSkill } from './skill/skill-load'
export type { ExecuteSkill } from './skill/skill-execute'
export { createSkillSearch } from './skill/skill-search'
export type { SearchSkills, SkillSearchEntry } from './skill/skill-search'
export { createSkillView } from './skill/skill-view'
export type { ViewSkill } from './skill/skill-view'
export { createSkillCreate } from './skill/skill-create'
export type { CreateSkill } from './skill/skill-create'
export { createSkillImprove } from './skill/skill-improve'
export type { ImproveSkill } from './skill/skill-improve'

// 注册表类型
export type {
  ToolMetadata,
  ToolMetadataCoverage,
  ToolMetadataCoverageIssue,
  RegisteredTool,
  ToolRegistrationOptions,
  ToolFactory,
} from './types'

// Binary 工具执行器
export {
  BinaryToolExecutorRegistry,
  createBinaryToolExecutorRegistry,
} from './binary/binary-executor-registry'

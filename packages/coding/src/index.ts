export { 
  createVitamin, 
  VitaminApp 
} from './vitamin'
export type { VitaminAppOptions } from './vitamin'

export { AgentSession } from './agent-session'
export type { AgentSessionConfig } from './agent-session'

export { createAgentSession } from './create-agent-session'
export { SettingsManager, createSettingsManager } from './settings-manager'
export type { SettingsManagerOptions } from './settings-manager'

export { CodingSessionManager, createCodingSessionManager } from './coding-session-manager'
export type { SessionManagerOptions } from './coding-session-manager'

export {
  DefaultResourceLoader,
  createResourceLoader,
  createInMemoryResourceLoader,
} from './resource-loader'
export type {
  ResourceLoader,
  ResourceLoaderOptions,
  LoadedResources,
  ResourceDiagnostic,
  PromptTemplate,
} from './resource-loader'

export {
  ExtensionManager,
  createExtensionManager,
} from './extension-api'
export type {
  ExtensionAPI,
  ExtensionModule,
  ExtensionDescriptor,
  ExtensionActivate,
  LoadedExtension,
} from './extension-api'

export {
  InteractiveMode,
  getLastAssistantText,
  runJsonMode,
  runPrintMode,
  runRpcMode,
} from './run-modes'
export type {
  InteractiveResult,
  JsonModeResult,
  RpcPromptParams,
  RpcRequest,
  RpcResponse,
} from './run-modes'

export type {
  AgentSessionOptions,
  AgentSessionInfo,
  AgentSessionEvent,
  AgentSessionEventType,
  AgentSessionSubscriber,
  CreateAgentSessionOptions,
  PromptOptions,
} from './types'

// Skill 子系统
export {
  SkillRegistry,
  loadSkills,
  formatSkillsForPrompt,
  parseSkillFile,
  LocalSkillReader,
  deriveSkillName,
  RemoteSkillReader,
} from './skill'
export type {
  Skill,
  SkillSource,
  SkillFrontmatter,
  SkillDiagnostic,
  LoadSkillsResult,
  LoadSkillsOptions,
  SkillReader,
  SkillEntry,
  SkillContent,
  LocalSkillReaderOptions,
  RemoteSkillReaderOptions,
  RemoteSkillEntry,
  ParseResult,
} from './skill'

// MCP Runtime
export { McpRuntime, createMcpRuntime } from './mcp-runtime'
export type { McpRuntimeOptions } from './mcp-runtime'
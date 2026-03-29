export { 
  createVitamin, 
  VitaminApp 
} from './app/vitamin-app'
export type { VitaminAppOptions } from './app/types'

export { AgentSession } from './session/agent-session'
export type { AgentSessionConfig } from './session/agent-session'

export { createAgentSession } from './session/create-agent-session'
export { Settings, createSettings } from './resources/settings-manager'
export type { SettingsOptions } from './resources/settings-manager'

export { CodingSessionManager, createSessionManager, createCodingSessionManager } from './session/coding-session-manager'
export type { SessionManagerOptions } from './session/coding-session-manager'

// Resources
export {
  DefaultResourceManager,
  createResourceManager,
  createInMemoryResourceManager,
} from './resources/resource-manager'

export type {
  ResourceManager,
  ResourceManagerOptions,
  LoadedResources,
  ResourceDiagnostic,
  PromptTemplate,
} from './resources/resource-manager'

// Modes
export {
  InteractiveMode,
  getLastAssistantText,
  runJsonMode,
  runPrintMode,
  runRpcMode,
} from './modes/run-modes'
export type {
  InteractiveResult,
  JsonModeResult,
  RpcPromptParams,
  RpcRequest,
  RpcResponse,
} from './modes/run-modes'
export {
  LeadInteractiveMode,
  runLeadJsonMode,
  runLeadPrintMode,
} from './modes/lead-modes'

// Types
export type {
  AgentSessionOptions,
  AgentSessionInfo,
  AgentSessionEvent,
  AgentSessionEventType,
  AgentSessionSubscriber,
  CreateAgentSessionOptions,
  PromptOptions,
} from './session/types'

// Lead
export {
  PromptManager,
  createPromptManager,
  LEAD_ROLE_INSTRUCTIONS,
  SUBAGENT_ROLE_INSTRUCTIONS,
} from './lead/prompt-manager'

export type {
  PromptManagerOptions,
  PromptBuildOptions,
  SubagentPromptOptions,
  PromptAgentSummary,
  PromptToolSummary,
} from './lead/prompt-manager'

export { LeadSession, createLeadSession, parseLeadResult } from './lead/lead-session'
export type { LeadResult, LeadResultStatus, LeadRunOptions, TaskSummary } from './lead/lead-session'
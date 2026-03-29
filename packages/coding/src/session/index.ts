export { AgentSession } from './agent-session'
export type { AgentSessionConfig } from './agent-session'

export { buildAgentSession, resolveAgentProviderRegistry } from './agent-session-factory'
export { createAgentSession } from './create-agent-session'

export { CodingSessionManager, createSessionManager, createCodingSessionManager } from './coding-session-manager'
export type { SessionManagerOptions } from './coding-session-manager'

export { createToolHookExecutor } from './hooks'

export type {
  AgentSessionOptions,
  AgentSessionInfo,
  AgentSessionEvent,
  AgentSessionEventType,
  AgentSessionSubscriber,
  CreateAgentSessionOptions,
  PromptOptions,
} from './types'

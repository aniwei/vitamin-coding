import type {
  AgentMessage,
  AgentTool,
} from '@vitamin/agent'
import type {
  Model,
  ProviderRegistry,
  ThinkingLevel,
  WorkflowSlot
} from '@vitamin/ai'
import type { HookRegistry } from '@vitamin/hooks'
import type {
  PromptPreset,
  SubAgentPromptContext
} from '@vitamin/prompt'
import type { Logger } from '@vitamin/shared'
import type { Devtools } from '@vitamin/devtools'
import type { SessionStore } from '@vitamin/session'

// Re-export event types from @vitamin/agent so downstream packages import from there,
// but coding-internal code (agent-session.ts etc.) can still import from this file.
export type {
  AgentSessionEvent,
  AgentSessionEventType,
  AgentSessionSubscriber,
  AskUserQuestion,
} from '@vitamin/agent'

export interface AgentSessionOptions {
  id?: string
  model: Model
  agentName?: string
  promptPreset?: PromptPreset
  promptContext?: SubAgentPromptContext
  slot?: WorkflowSlot
  systemPrompt?: string
  tools?: AgentTool[]
  thinkingLevel?: ThinkingLevel
  maxToolTurns?: number
  workspaceDir?: string
  hooks?: HookRegistry
  hookRegistry: HookRegistry
  providerRegistry?: ProviderRegistry
  logger: Logger
  devtools?: Devtools
  promptRefresh?: PromptRefresh
}

export interface CreateAgentSessionOptions extends AgentSessionOptions {
  sessionStore?: SessionStore<AgentMessage>
}

export interface AgentSessionInfo {
  id: string
  messageCount: number
  createdAt: Date
  updatedAt?: Date
  model?: string
  status: string
}

export interface PromptOptions {
  images?: Array<{ type: 'image'; data: string; mediaType: string }>
  streamingBehavior?: 'steer' | 'followUp'
}

export type PromptRefresh = () => Promise<string | undefined>
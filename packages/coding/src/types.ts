
import type { AgentTool } from '@vitamin/agent'
import type { AuthStore, Model, ProviderRegistry } from '@vitamin/ai'
import type { ModelRegistry } from '@vitamin/ai'
import type { HookRegistry } from '@vitamin/hooks'
import type { ToolRegistry } from '@vitamin/tools'

import type { ResourceManager } from '@vitamin/resources'
import type { SettingsManager } from '@vitamin/resources'
import type { CodingSessionManager } from './session/coding-session-manager'
import type { AgentSessionInfo, AgentSessionOptions } from './session/types'
import type { AgentSession } from './session/agent-session'



export interface VitaminContext {
  readonly workspaceDir: string
  readonly tools: AgentTool[]

  readonly settings: SettingsManager
  readonly resourceManager: ResourceManager
  readonly modelRegistry: ModelRegistry
  readonly providerRegistry: ProviderRegistry
  readonly hookRegistry: HookRegistry
  readonly toolRegistry: ToolRegistry
  readonly sessionManager: CodingSessionManager
  readonly authStore: AuthStore

  start(): Promise<void>
  stop(): Promise<void>
  createSession(options?: Partial<AgentSessionOptions>): Promise<AgentSession>
  getSession(id: string): AgentSession | undefined
  listSessions(): AgentSessionInfo[]
  removeSession(id: string): Promise<boolean>
  forkSession(sourceId: string, newId?: string): Promise<AgentSession | undefined>
}

export interface VitaminAppOptions {
  port: number
  inspect: boolean
  logger: {
    name: string
    level: 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'fatal'
    destination: string
  }
  
  model?: Model
  modelRegistry?: ModelRegistry 
  tools?: AgentTool[]
  authStore?: AuthStore
  providerRegistry?: ProviderRegistry
  systemPrompt?: string
  hookRegistry?: HookRegistry
  workspaceDir?: string
  sessionDir?: string
  sessionUrl?: string
  maxSessions?: number
  maxToolTurns?: number
  resourceManager?: ResourceManager
}

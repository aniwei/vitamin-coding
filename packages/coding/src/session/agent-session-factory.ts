import { createAgentWithRegistry } from '@vitamin/agent'
import { createHookRegistry } from '@vitamin/hooks'
import { AgentSession } from './agent-session'

import type { AgentMessage, AgentTool } from '@vitamin/agent'
import type { Model, ProviderRegistry, ThinkingLevel } from '@vitamin/ai'
import type { Devtools } from '@vitamin/devtools'
import type { HookRegistry } from '@vitamin/hooks'
import type { Session } from '@vitamin/session'
import type { Logger } from '@vitamin/shared'

interface BuildAgentSessionOptions {
  model: Model
  session: Session<AgentMessage>
  systemPrompt: string
  tools: AgentTool[]
  thinkingLevel: ThinkingLevel
  maxToolTurns: number
  hookRegistry: HookRegistry
  providerRegistry: ProviderRegistry
  devtools?: Devtools
  logger: Logger,
  workspaceDir: string
  promptRefreshFn?: () => string | undefined
}

export function resolveAgentProviderRegistry(
  explicit?: ProviderRegistry,
): ProviderRegistry | undefined {
  return explicit
}

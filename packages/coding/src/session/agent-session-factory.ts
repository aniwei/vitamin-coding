import { createAgentWithRegistry } from '@vitamin/agent'
import { createHookRegistry } from '@vitamin/hooks'
import { AgentSession } from './agent-session'

import type { AgentMessage, AgentTool } from '@vitamin/agent'
import type { Model, ProviderRegistry, ThinkingLevel } from '@vitamin/ai'
import type { Devtools } from '@vitamin/devtools'
import type { HookRegistry } from '@vitamin/hooks'
import type { Session } from '@vitamin/session'
import type { createLogger } from '@vitamin/shared'

interface BuildAgentSessionOptions {
  model: Model
  session: Session<AgentMessage>
  systemPrompt?: string
  tools?: AgentTool[]
  thinkingLevel?: ThinkingLevel
  maxToolTurns?: number
  hooks?: HookRegistry
  providerRegistry?: ProviderRegistry
  workspaceDir?: string
  devtools?: Devtools
  logger?: ReturnType<typeof createLogger>
  promptRefreshFn?: () => string | undefined
}

export function resolveAgentProviderRegistry(
  explicit?: ProviderRegistry,
): ProviderRegistry | undefined {
  return explicit
}

export function buildAgentSession(options: BuildAgentSessionOptions): AgentSession {
  const hooks = options.hooks ?? createHookRegistry({ preset: 'default' })
  const providerRegistry = resolveAgentProviderRegistry(options.providerRegistry)
  const agent = createAgentWithRegistry({
    model: options.model,
    providerRegistry,
  })

  return new AgentSession(options.session, agent, {
    model: options.model,
    systemPrompt: options.systemPrompt ?? '',
    tools: options.tools,
    thinkingLevel: options.thinkingLevel,
    maxToolTurns: options.maxToolTurns,
    hooks,
    workspaceDir: options.workspaceDir,
    devtools: options.devtools,
    logger: options.logger,
    promptRefreshFn: options.promptRefreshFn,
  })
}
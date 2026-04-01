import { createAgentWithRegistry, type AgentMessage } from '@vitamin/agent'
import { createDefaultProviderRegistry } from '@vitamin/ai'
import { createHookRegistry } from '@vitamin/hooks'
import { createLogger } from '@vitamin/shared'
import { createInMemorySessionStore } from '@vitamin/session'

import { AgentSession } from './agent-session'

import type { CreateAgentSessionOptions } from './types'

export function createAgentSession(options: CreateAgentSessionOptions): AgentSession {
  const sessionId = options.id ?? crypto.randomUUID()
  const sessionStore = options.sessionStore ?? createInMemorySessionStore<AgentMessage>()
  void sessionStore.createSession(sessionId)

  const session = sessionStore.getSession(sessionId)
  if (!session) {
    throw new Error(`Failed to create session ${sessionId}`)
  }

  const providerRegistry = options.providerRegistry ?? createDefaultProviderRegistry()
  const hookRegistry = options.hookRegistry ?? options.hooks ?? createHookRegistry({ preset: 'default' })
  const logger = options.logger ?? createLogger(`coding-agent-session:${sessionId}`, {
    level: 'info',
    destination: 'stdout',
  })

  const agent = createAgentWithRegistry({
    model: options.model,
    providerRegistry,
  })

  return new AgentSession(session, agent, {
    ...options,
    id: sessionId,
    hookRegistry,
    logger,
    providerRegistry,
    workspaceDir: options.workspaceDir ?? process.cwd(),
    systemPrompt: options.systemPrompt ?? '',
    tools: options.tools ?? [],
    thinkingLevel: options.thinkingLevel ?? 'medium',
    maxToolTurns: options.maxToolTurns ?? 25,
  })
}
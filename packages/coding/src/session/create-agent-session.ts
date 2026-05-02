import {
  stream as aiStream,
  createDefaultProviderRegistry,
  type ProviderRegistry,
} from '@x-mars/ai'
import { createHookRegistry } from '@x-mars/hooks'
import { createLogger } from '@x-mars/shared'
import { createInMemorySessionStore } from '@x-mars/session'
import type { AgentMessage, StreamFunction } from '@x-mars/agent'

import { AgentSession } from './agent-session'

import type { CreateAgentSessionOptions } from './types'

// 组合层：ProviderRegistry + aiStream → StreamFunction
function makeStream(registry: ProviderRegistry): StreamFunction {
  return (context, signal) => {
    const provider = registry.get(context.model.api)
    return aiStream(context.model, provider, context, { signal })
  }
}

export function createAgentSession(options: CreateAgentSessionOptions): AgentSession {
  const sessionId = options.id ?? crypto.randomUUID()

  const sessionStore = options.sessionStore ?? createInMemorySessionStore<AgentMessage>()

  void sessionStore.createSession(sessionId)

  const session = sessionStore.getSession(sessionId)
  if (!session) {
    throw new Error(`Failed to create session ${sessionId}`)
  }

  const providerRegistry = options.providerRegistry ?? createDefaultProviderRegistry()
  const hookRegistry = options.hookRegistry ?? createHookRegistry({ preset: 'default' })
  const logger =
    options.logger ??
    createLogger(`coding-agent-session:${sessionId}`, {
      level: 'info',
      destination: 'stdout',
    })

  // 优先使用调用方直接传入的 stream，否则从 providerRegistry 推导
  const stream = options.stream ?? makeStream(providerRegistry)

  return new AgentSession(session, {
    ...options,
    id: sessionId,
    hookRegistry,
    logger,
    stream,
    workspaceDir: options.workspaceDir ?? process.cwd(),
    systemPrompt: options.systemPrompt ?? '',
    tools: options.tools ?? [],
    thinkingLevel: options.thinkingLevel ?? 'medium',
    maxToolTurns: options.maxToolTurns ?? 25,
  })
}

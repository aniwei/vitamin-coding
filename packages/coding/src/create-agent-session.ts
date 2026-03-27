import { createAgentWithRegistry } from '@vitamin/agent'
import { createInMemorySessionStore } from '@vitamin/session'
import { createHookRegistry } from '@vitamin/hooks'
import { createDefaultProviderRegistry } from '@vitamin/ai'
import { AgentSession } from './agent-session'
import type { CreateAgentSessionOptions } from './types'

/// 单会话工厂 — 无需 VitaminApp 即可创建独立的 AgentSession。
// 适用于嵌入式集成、CLI、测试等场景，
// 当你只需要一个 AgentSession 而不需要多会话管理时使用。
export function createAgentSession(options: CreateAgentSessionOptions): AgentSession {
  const {
    model,
    systemPrompt = '',
    tools = [],
    thinkingLevel,
    hooks,
    providerRegistry,
    sessionStore,
    id,
  } = options

  const store = sessionStore ?? createInMemorySessionStore()
  const sessionId = id ?? crypto.randomUUID()
  const session = store.createSession(sessionId)

  const resolvedProviderRegistry = providerRegistry
    ?? (model.api === 'github-copilot'
      ? createDefaultProviderRegistry()
      : undefined)

  const agent = createAgentWithRegistry({
    model,
    providerRegistry: resolvedProviderRegistry,
  })


  return new AgentSession(session, agent, {
    model,
    systemPrompt,
    tools,
    thinkingLevel,
    hooks: hooks ?? createHookRegistry({ preset: 'default' }),
    workspaceDir: options.workspaceDir,
  })
}

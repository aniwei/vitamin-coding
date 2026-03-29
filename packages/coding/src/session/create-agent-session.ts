import { createInMemorySessionStore } from '@vitamin/session'
import { AgentSession } from './agent-session'
import { buildAgentSession } from './agent-session-factory'
import type { CreateAgentSessionOptions } from './types'

/// 单会话工厂 — 无需 VitaminApp 即可创建独立的 AgentSession。
// 适用于嵌入式集成、CLI、测试等场景，
// 当你只需要一个 AgentSession 而不需要多会话管理时使用。
export function createAgentSession(options: CreateAgentSessionOptions): AgentSession {
  const {
    model,
    systemPrompt,
    tools,
    thinkingLevel,
    hooks,
    providerRegistry,
    sessionStore,
    id,
    maxToolTurns,
    logger,
  } = options

  const store = sessionStore ?? createInMemorySessionStore()
  const sessionId = id ?? crypto.randomUUID()
  const session = store.createSession(sessionId)

  return buildAgentSession({
    session,
    model,
    systemPrompt,
    tools,
    thinkingLevel,
    maxToolTurns,
    hooks,
    providerRegistry,
    workspaceDir: options.workspaceDir,
    logger,
  })
}

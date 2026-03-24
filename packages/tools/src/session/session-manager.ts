// session-manager 工具 — 会话管理
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const SessionManagerArgsSchema = z.object({
  action: z.enum(['list', 'create', 'remove', 'compact']).describe('Session management action to perform'),
  sessionId: z.string().optional().describe('Session ID (required for remove/compact)'),
  title: z.string().optional().describe('New session title (optional when creating)'),
})

type SessionManagerArgs = z.infer<typeof SessionManagerArgsSchema>

export interface SessionManager {
  list: () => Promise<Array<{ id: string; title: string; messageCount: number }>>
  create: (title?: string) => Promise<{ id: string }>
  remove: (id: string) => Promise<boolean>
  compact: (id: string) => Promise<boolean>
}

interface SessionManagerOptions {
  projectRoot: string
  sessionManager?: SessionManager
}

export function createSessionManager(options: SessionManagerOptions): AgentTool<SessionManagerArgs> {
  const { sessionManager } = options

  return {
    name: 'session_manager',
    description: 'Manage conversation sessions: list, create, remove, compact.',
    parameters: SessionManagerArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!sessionManager) {
        throw new Error('SessionManager is not provided in options')
      }

      return await execute(
        params.action,
        sessionManager,
        params.sessionId,
        params.title
      )
    },
  }
}

async function execute(
  action: 'list' | 'create' | 'remove' | 'compact',
  sessionManager: SessionManager,
  sessionId?: string,
  title?: string,
): Promise<ToolResult> {
  switch (action) {
    case 'list': {
      const sessions = await sessionManager.list()
      
      const text = sessions.length === 0
        ? 'No sessions found.'
        : sessions.map((s) => `- ${s.id}: ${s.title} (${s.messageCount} messages)`).join('\n')
      return { content: [{ type: 'text', text }] }
    }

    case 'create': {
      const session = await sessionManager.create(title)
      return { content: [{ type: 'text', text: `Session created: ${session.id}` }] }
    }

    case 'remove': {
      if (!sessionId) {
        throw new Error('sessionId required for remove')
      }
      
      const removed = await sessionManager.remove(sessionId)
      return {
        content: [{ type: 'text', text: removed ? `Session ${sessionId} removed` : 'Session not found' }],
        isError: !removed,
      }
    }
    case 'compact': {
      if (!sessionId) {
        throw new Error('sessionId required for compact')
      }
      const compacted = await sessionManager.compact(sessionId)

      return {
        content: [{ type: 'text', text: compacted ? `Session ${sessionId} compacted` : 'Compact failed' }],
        isError: !compacted,
      }
    }
  }
}
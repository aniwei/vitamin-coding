// session-manager 工具 — 会话管理
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const SessionManagerArgsSchema = z.object({
  action: z.enum(['list', 'create', 'remove', 'compact']).describe('会话操作'),
  sessionId: z.string().optional().describe('会话 ID（remove/compact 必需）'),
  title: z.string().optional().describe('新会话标题（create 时可选）'),
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
    name: 'session-manager',
    description: '管理对话会话：列出、创建、删除、压缩会话。',
    parameters: SessionManagerArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!sessionManager) {
        return {
          content: [{ type: 'text', text: 'session-manager not available' }],
          isError: true,
        }
      }

      switch (args.action) {
        case 'list': {
          const sessions = await sessionManager.list()
          const text = sessions.length === 0
            ? 'No sessions found.'
            : sessions.map((s) => `- ${s.id}: ${s.title} (${s.messageCount} messages)`).join('\n')
          return { content: [{ type: 'text', text }] }
        }
        case 'create': {
          const session = await sessionManager.create(args.title)
          return { content: [{ type: 'text', text: `Session created: ${session.id}` }] }
        }
        case 'remove': {
          if (!args.sessionId) {
            return { content: [{ type: 'text', text: 'sessionId required for remove' }], isError: true }
          }
          const removed = await sessionManager.remove(args.sessionId)
          return {
            content: [{ type: 'text', text: removed ? `Session ${args.sessionId} removed` : 'Session not found' }],
            isError: !removed,
          }
        }
        case 'compact': {
          if (!args.sessionId) {
            return { content: [{ type: 'text', text: 'sessionId required for compact' }], isError: true }
          }
          const compacted = await sessionManager.compact(args.sessionId)
          return {
            content: [{ type: 'text', text: compacted ? `Session ${args.sessionId} compacted` : 'Compact failed' }],
            isError: !compacted,
          }
        }
      }
    },
  }
}

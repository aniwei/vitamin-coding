/**
 * message-serializer.ts
 *
 * 统一的消息序列化工具，供 chat 和 sessions 路由共用。
 */

import type { AgentSession } from '@vitamin/coding'
import type { AgentMessage } from '@vitamin/agent'
import type { TextContent, ToolCall } from '@vitamin/ai'

export interface SerializedToolCall {
  id: string
  name: string
  parameters: Record<string, unknown>
}

export interface SerializedMessage {
  role: string
  content: string
  timestamp: number | undefined
  toolCalls: SerializedToolCall[]
}

export function serializeSessionMessages(session: AgentSession): SerializedMessage[] {
  const messages = session.session.messages() as AgentMessage[]
  return messages.map((msg) => ({
    role: msg.role,
    content: extractTextContent(msg),
    timestamp: 'timestamp' in msg ? (msg.timestamp as number) : undefined,
    toolCalls: extractToolCalls(msg),
  }))
}

function extractTextContent(msg: AgentMessage): string {
  if (typeof msg.content === 'string') {
    return msg.content
  }
  if (Array.isArray(msg.content)) {
    return (msg.content as unknown[])
      .filter((b): b is TextContent => (b as TextContent).type === 'text')
      .map((b) => b.text)
      .join('')
  }
  return ''
}

function extractToolCalls(msg: AgentMessage): SerializedToolCall[] {
  if (!Array.isArray(msg.content)) {
    return []
  }
  return (msg.content as unknown[])
    .filter((b): b is ToolCall => (b as ToolCall).type === 'tool_call')
    .map((b) => ({
      id: b.id ?? '',
      name: b.name ?? '',
      parameters: b.arguments ?? {},
    }))
}

/**
 * Compat shim for @/app/api/chat/actions (server actions → fetch calls)
 */
import type { ChatModel, ChatThread } from 'app-types/chat'
import type { MCPToolInfo } from 'app-types/mcp'
import type { JSONSchema7 } from 'json-schema'

export async function deleteThreadAction(threadId: string) {
  const res = await fetch(`/api/thread/${threadId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}

export async function deleteMessageAction(messageId: string) {
  const res = await fetch(`/api/thread/messages/${messageId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}

export async function deleteMessagesByChatIdAfterTimestampAction(messageId: string) {
  const res = await fetch(`/api/thread/messages/${messageId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}

export async function updateThreadAction(
  id: string,
  thread: Partial<Omit<ChatThread, 'createdAt' | 'updatedAt' | 'userId'>>,
) {
  const res = await fetch(`/api/thread/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(thread),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<ChatThread>
}

export async function deleteThreadsAction() {
  const res = await fetch('/api/thread', { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}

export async function deleteUnarchivedThreadsAction() {
  const res = await fetch('/api/thread/delete-unarchived', { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
}

export async function generateExampleToolSchemaAction(options: {
  model?: ChatModel
  toolInfo: MCPToolInfo
  prompt?: string
}) {
  const res = await fetch('/api/chat/generate-example-schema', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function generateObjectAction({
  model,
  prompt,
  schema,
}: {
  model?: ChatModel
  prompt: { system?: string; user?: string }
  schema: JSONSchema7 | Record<string, unknown>
}) {
  const res = await fetch('/api/chat/generate-object', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, schema }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function exportChatAction({
  threadId,
  expiresAt,
}: {
  threadId: string
  expiresAt?: Date
}) {
  const res = await fetch('/api/chat/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId, expiresAt }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<string>
}

// Stubs for server-only actions used internally (not needed client-side)
export async function generateTitleFromUserMessageAction(_opts: unknown) {
  return ''
}
export async function selectThreadWithMessagesAction(_threadId: string) {
  return null
}
export async function rememberMcpServerCustomizationsAction(_userId: string) {
  return {}
}
export async function rememberAgentAction(_agent: string | undefined, _userId: string) {
  return undefined
}

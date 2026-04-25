import { fetcher } from '@/lib/utils'

export async function deleteThreadAction(threadId: string): Promise<void> {
  await fetcher(`/api/chat/threads/${threadId}`, { method: 'DELETE' })
}

export async function deleteThreadsAction(): Promise<void> {
  await fetcher('/api/chat/threads', { method: 'DELETE' })
}

export async function deleteUnarchivedThreadsAction(): Promise<void> {
  await fetcher('/api/chat/threads/unarchived', { method: 'DELETE' })
}

export async function updateThreadAction(
  threadId: string,
  data: { title?: string; pinned?: boolean }
): Promise<void> {
  await fetcher(`/api/chat/threads/${threadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteMessageAction(messageId: string): Promise<void> {
  await fetcher(`/api/chat/messages/${messageId}`, { method: 'DELETE' })
}

export async function deleteMessagesByChatIdAfterTimestampAction(
  _chatId: string,
  _timestamp: number
): Promise<void> {
  // TODO: wire backend endpoint if needed during Phase 4 feature parity pass.
  return
}

export async function selectThreadWithMessagesAction(threadId: string) {
  return fetcher(`/api/chat/threads/${threadId}/messages`)
}

export async function generateTitleFromUserMessageAction({
  message,
  threadId,
}: {
  message: string
  threadId: string
}): Promise<string> {
  const result = (await fetcher('/api/chat/generate-title', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, threadId }),
  })) as { title?: string }
  return result.title ?? ''
}

export async function exportChatAction({ threadId }: { threadId: string }) {
  return fetcher(`/api/chat/export/${threadId}`)
}

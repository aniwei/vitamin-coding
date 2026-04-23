import { selectThreadWithMessagesAction } from '@/app/api/chat/actions'
import ChatBot from '@/components/chat-bot'
import ChatBotService from '@/components/chat-bot-service'

import { ChatMessage, ChatThread } from 'app-types/chat'
import { redirect, RedirectType } from 'next/navigation'

const IS_SERVICE_MODE = process.env['NEXT_PUBLIC_CHAT_BACKEND'] === 'service'

const fetchThread = async (
  threadId: string
): Promise<(ChatThread & { messages: ChatMessage[] }) | null> => {
  return await selectThreadWithMessagesAction(threadId)
}

export default async function Page({
  params,
}: {
  params: Promise<{ thread: string }>
}) {
  const { thread: threadId } = await params

  // In service mode, history is loaded directly from @vitamin/service via WS/REST.
  // Skip the PG lookup and render the service-mode chat component.
  if (IS_SERVICE_MODE) {
    return <ChatBotService threadId={threadId} />
  }

  const thread = await fetchThread(threadId)

  if (!thread) redirect('/', RedirectType.replace)

  return <ChatBot threadId={threadId} initialMessages={thread.messages} />
}

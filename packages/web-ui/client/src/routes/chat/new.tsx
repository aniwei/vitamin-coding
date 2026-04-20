import { generateUUID } from 'lib/utils'
import ChatBot from '@/components/chat-bot'

export default function NewChatPage() {
  const id = generateUUID()
  return <ChatBot initialMessages={[]} threadId={id} key={id} />
}

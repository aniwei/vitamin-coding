import ChatBot from '@/components/chat-bot'
import ChatBotService from '@/components/chat-bot-service'
import { generateUUID } from 'lib/utils'
import { getSession } from 'auth/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const IS_SERVICE_MODE = process.env['NEXT_PUBLIC_CHAT_BACKEND'] === 'service'

export default async function HomePage() {
  const session = await getSession()
  if (!session) {
    redirect('/sign-in')
  }
  const id = generateUUID()
  if (IS_SERVICE_MODE) {
    return <ChatBotService threadId={id} key={id} />
  }
  return <ChatBot initialMessages={[]} threadId={id} key={id} />
}

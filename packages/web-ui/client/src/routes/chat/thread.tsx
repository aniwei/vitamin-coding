import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import useSWR from 'swr'
import ChatBot from '@/components/chat-bot'
import { fetcher } from 'lib/utils'

export default function ThreadPage() {
  const navigate = useNavigate()
  const { thread: threadId } = useParams<{ thread: string }>()
  const { data: thread, error } = useSWR(
    threadId ? `/api/thread/${threadId}` : null,
    fetcher,
  )

  useEffect(() => {
    if (error) {
      navigate('/', { replace: true })
    }
  }, [error, navigate])

  if (!threadId) return null
  if (!thread && !error) return null
  if (!thread) return null

  return <ChatBot threadId={threadId} initialMessages={thread.messages} />
}

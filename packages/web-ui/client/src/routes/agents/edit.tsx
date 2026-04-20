import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import useSWR from 'swr'
import { authClient } from 'auth/client'
import EditAgent from '@/components/agent/edit-agent'
import { fetcher } from 'lib/utils'

export default function AgentEditPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { data: session, isPending: sessionPending } = authClient.useSession()
  const { data: agent, error } = useSWR(
    id && id !== 'new' && !sessionPending ? `/api/agent/${id}` : null,
    fetcher,
  )

  useEffect(() => {
    if (error) navigate('/agents', { replace: true })
  }, [error, navigate])

  if (sessionPending || !session) return null
  if (!id) return null

  if (id === 'new') {
    return <EditAgent userId={session.user.id} />
  }

  if (!agent && !error) return null

  const isOwner = agent?.userId === session.user.id
  const hasEditAccess = isOwner || agent?.visibility === 'public'

  return (
    <EditAgent
      key={id}
      initialAgent={agent}
      userId={session.user.id}
      isOwner={isOwner}
      hasEditAccess={hasEditAccess}
      isBookmarked={agent?.isBookmarked || false}
    />
  )
}

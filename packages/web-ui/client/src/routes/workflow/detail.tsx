import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import useSWR from 'swr'
import { authClient } from 'auth/client'
import Workflow from '@/components/workflow/workflow'
import { convertDBEdgeToUIEdge, convertDBNodeToUINode } from 'lib/ai/workflow/shared.workflow'
import { fetcher } from 'lib/utils'

export default function WorkflowDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { data: session, isPending: sessionPending } = authClient.useSession()
  const { data: structure, error } = useSWR(
    id && !sessionPending ? `/api/workflow/${id}/structure` : null,
    fetcher,
  )

  useEffect(() => {
    if (error) navigate('/', { replace: true })
  }, [error, navigate])

  if (sessionPending || !session || !id) return null
  if (!structure && !error) return null
  if (!structure) return null

  const initialNodes = structure.nodes.map(convertDBNodeToUINode)
  const initialEdges = structure.edges.map(convertDBEdgeToUIEdge)
  const hasEditAccess = structure.userId === session.user.id

  return (
    <Workflow
      key={id}
      workflowId={id}
      initialNodes={initialNodes}
      initialEdges={initialEdges}
      hasEditAccess={hasEditAccess}
    />
  )
}

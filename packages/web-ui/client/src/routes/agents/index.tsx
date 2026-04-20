import { authClient } from 'auth/client'
import { AgentsList } from '@/components/agent/agents-list'

export default function AgentsPage() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending || !session) return null

  return (
    <AgentsList
      initialMyAgents={[]}
      initialSharedAgents={[]}
      userId={session.user.id}
      userRole={session.user.role}
    />
  )
}

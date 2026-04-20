import { authClient } from 'auth/client'
import MCPDashboard from '@/components/mcp-dashboard'

export default function McpIndexPage() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending || !session) return null

  return <MCPDashboard user={session.user} />
}

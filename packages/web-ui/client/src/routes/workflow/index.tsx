import { authClient } from 'auth/client'
import WorkflowListPage from '@/components/workflow/workflow-list-page'

export default function WorkflowPage() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) return null

  return <WorkflowListPage userRole={session?.user?.role} />
}

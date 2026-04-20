import { useEffect, Suspense } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import useSWR from 'swr'
import { authClient } from 'auth/client'
import { UserDetail } from '@/components/user/user-detail/user-detail'
import { UserStatsCardLoaderSkeleton } from '@/components/user/user-detail/user-stats-card-loader'
import { UserStatisticsCard } from '@/components/user/user-detail/user-statistics-card'
import { UserDetailClientLoader } from '../../components/user-detail-client-loader'
import { fetcher } from 'lib/utils'

function UserStatsAdminClient({ userId }: { userId: string }) {
  const { data: stats } = useSWR(`/api/user/stats?userId=${userId}`, fetcher)
  if (!stats) return <UserStatsCardLoaderSkeleton />
  return <UserStatisticsCard stats={{ ...stats, period: 'Last 30 Days' }} view='admin' />
}

export default function AdminUserDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { data: session, isPending } = authClient.useSession()
  const { data: user, error } = useSWR(
    id && !isPending && session ? `/api/user/details/${id}` : null,
    fetcher,
  )
  const { data: accounts } = useSWR(
    id && !isPending && session ? `/api/user/accounts?userId=${id}` : null,
    fetcher,
  )

  useEffect(() => {
    if (!isPending && session && session.user.role !== 'admin') {
      navigate('/', { replace: true })
    }
    if (error) navigate('/admin/users', { replace: true })
  }, [isPending, session, navigate, error])

  if (isPending || !session || !id) return null
  if (!user && !error) return null
  if (!user) return null

  return (
    <UserDetail
      user={user}
      currentUserId={session.user.id}
      userAccountInfo={accounts}
      userStatsSlot={
        <Suspense fallback={<UserStatsCardLoaderSkeleton />}>
          <UserStatsAdminClient userId={id} />
        </Suspense>
      }
      view='admin'
    />
  )
}

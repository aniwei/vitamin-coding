import { Suspense } from 'react'
import useSWR from 'swr'
import { authClient } from 'auth/client'
import { UserDetail } from '@/components/user/user-detail/user-detail'
import { UserDetailContentSkeleton } from '@/components/user/user-detail/user-detail-content-skeleton'
import { UserStatisticsCard } from '@/components/user/user-detail/user-statistics-card'
import { UserStatsCardLoaderSkeleton } from '@/components/user/user-detail/user-stats-card-loader'
import { fetcher } from 'lib/utils'

function UserStatsClient({ userId }: { userId: string }) {
  const { data: stats } = useSWR(`/api/user/stats?userId=${userId}`, fetcher)
  if (!stats) return <UserStatsCardLoaderSkeleton />
  return <UserStatisticsCard stats={{ ...stats, period: 'Last 30 Days' }} view='user' />
}

export function UserDetailClientLoader({ view = 'user' }: { view?: 'admin' | 'user' }) {
  const { data: session } = authClient.useSession()
  const { data: user, isLoading } = useSWR('/api/user/details', fetcher)
  const { data: accounts } = useSWR('/api/user/accounts', fetcher)

  if (isLoading || !user || !session) return <UserDetailContentSkeleton />

  return (
    <UserDetail
      view={view}
      user={user}
      currentUserId={session.user.id}
      userAccountInfo={accounts}
      userStatsSlot={
        <Suspense fallback={<UserStatsCardLoaderSkeleton />}>
          <UserStatsClient userId={user.id} />
        </Suspense>
      }
    />
  )
}

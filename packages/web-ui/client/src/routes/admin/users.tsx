import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import useSWR from 'swr'
import { authClient } from 'auth/client'
import { UsersTable } from '@/components/admin/users-table'
import { fetcher } from 'lib/utils'

const ADMIN_USER_LIST_LIMIT = 10
const DEFAULT_SORT_BY = 'createdAt'
const DEFAULT_SORT_DIRECTION = 'desc'

export default function AdminUsersPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: session, isPending } = authClient.useSession()

  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = parseInt(searchParams.get('limit') ?? String(ADMIN_USER_LIST_LIMIT), 10)
  const query = searchParams.get('query') ?? undefined
  const sortBy = searchParams.get('sortBy') ?? DEFAULT_SORT_BY
  const sortDirection = (searchParams.get('sortDirection') ?? DEFAULT_SORT_DIRECTION) as 'asc' | 'desc'

  const queryString = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sortBy,
    sortDirection,
    ...(query ? { query } : {}),
  }).toString()

  const { data, error } = useSWR(
    !isPending && session ? `/api/admin/users?${queryString}` : null,
    fetcher,
  )

  useEffect(() => {
    if (!isPending && session && session.user.role !== 'admin') {
      navigate('/', { replace: true })
    }
  }, [isPending, session, navigate])

  if (isPending || !session) return null
  if (!data && !error) return null
  if (!data) return null

  return (
    <UsersTable
      users={data.users}
      currentUserId={session.user.id}
      total={data.total}
      page={page}
      limit={limit}
      query={query}
      baseUrl='/admin/users'
      sortBy={sortBy}
      sortDirection={sortDirection}
    />
  )
}

import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { authClient } from 'auth/client'
import { SidebarProvider } from 'ui/sidebar'
import { AppSidebar } from '@/components/layouts/app-sidebar'
import { AppHeader } from '@/components/layouts/app-header'
import { AppPopupProvider } from '@/components/layouts/app-popup-provider'
import { SWRConfigProvider } from '@/components/layouts/swr-config'
import { UserDetailClientLoader } from '../components/user-detail-client-loader'

export function ChatLayout() {
  const navigate = useNavigate()
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (!isPending && !session) {
      navigate('/sign-in', { replace: true })
    }
  }, [isPending, session, navigate])

  if (isPending) return null
  if (!session) return null

  return (
    <SidebarProvider defaultOpen>
      <SWRConfigProvider user={session.user}>
        <AppPopupProvider userSettingsComponent={<UserDetailClientLoader view='user' />} />
        <AppSidebar user={session.user} />
        <main className='relative bg-background w-full flex flex-col h-screen'>
          <AppHeader />
          <div className='flex-1 overflow-y-auto'>
            <Outlet />
          </div>
        </main>
      </SWRConfigProvider>
    </SidebarProvider>
  )
}

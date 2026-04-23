import { SidebarProvider } from 'ui/sidebar'
import { AppSidebar } from '@/components/layouts/app-sidebar'
import { AppHeader } from '@/components/layouts/app-header'
import { cookies } from 'next/headers'

import { getSession } from 'lib/auth/server'
import { COOKIE_KEY_SIDEBAR_STATE } from 'lib/const'
import { AppPopupProvider } from '@/components/layouts/app-popup-provider'
import { SWRConfigProvider } from './swr-config'
import { UserDetailContent } from '@/components/user/user-detail/user-detail-content'
import { UserDetailContentSkeleton } from '@/components/user/user-detail/user-detail-content-skeleton'

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
export const experimental_ppr = true

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const session = await getSession()
  if (!session) {
    redirect('/sign-in')
  }
  const isCollapsed =
    cookieStore.get(COOKIE_KEY_SIDEBAR_STATE)?.value !== 'true'
  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <SWRConfigProvider user={session.user}>
        <AppPopupProvider
          userSettingsComponent={
            <Suspense fallback={<UserDetailContentSkeleton />}>
              <UserDetailContent view="user" />
            </Suspense>
          }
        />
        <div className="flex flex-col w-full h-screen">
          <AppHeader user={session.user} />
          <div className="flex flex-1 overflow-hidden">
            <AppSidebar />
            <main className="relative bg-background flex-1 flex flex-col overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
      </SWRConfigProvider>
    </SidebarProvider>
  )
}

import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { authClient } from 'auth/client'
import { Think } from 'ui/think'
import { FlipWords } from 'ui/flip-words'
import { BackgroundPaths } from 'ui/background-paths'
import { useTranslations } from '@/hooks/use-translations'

export function AuthLayout() {
  const navigate = useNavigate()
  const { data: session, isPending } = authClient.useSession()
  const t = useTranslations('Auth.Intro')

  useEffect(() => {
    if (!isPending && session) {
      navigate('/', { replace: true })
    }
  }, [isPending, session, navigate])

  if (isPending) return null

  return (
    <main className='relative w-full flex flex-col h-screen'>
      <div className='flex-1'>
        <div className='flex min-h-screen w-full'>
          <div className='hidden lg:flex lg:w-1/2 bg-muted border-r flex-col p-18 relative'>
            <div className='absolute inset-0 w-full h-full'>
              <BackgroundPaths />
            </div>
            <h1 className='text-xl font-semibold flex items-center gap-3 animate-in fade-in duration-1000'>
              <Think />
              <span>Chat Bot</span>
            </h1>
            <div className='flex-1' />
            <FlipWords words={[t('description')]} className=' mb-4 text-muted-foreground' />
          </div>
          <div className='w-full lg:w-1/2 p-6'>
            <Outlet />
          </div>
        </div>
      </div>
    </main>
  )
}

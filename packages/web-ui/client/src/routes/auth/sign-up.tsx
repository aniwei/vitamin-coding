import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import SignUpComponent from '@/components/auth/sign-up'
import { fetcher } from 'lib/utils'

export default function SignUpPage() {
  const navigate = useNavigate()
  const { data: config } = useSWR('/api/auth/config', fetcher)

  useEffect(() => {
    if (!config) return
    if (!config.signUpEnabled) {
      navigate('/sign-in', { replace: true })
      return
    }
    if (config.emailAndPasswordEnabled && (config.socialAuthenticationProviders ?? []).length === 0) {
      navigate('/sign-up/email', { replace: true })
    }
  }, [config, navigate])

  if (!config) return null
  if (!config.signUpEnabled) return null

  return (
    <SignUpComponent
      isFirstUser={config.isFirstUser}
      emailAndPasswordEnabled={config.emailAndPasswordEnabled}
      socialAuthenticationProviders={config.socialAuthenticationProviders ?? []}
    />
  )
}

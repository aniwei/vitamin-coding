import useSWR from 'swr'
import SignInComponent from '@/components/auth/sign-in'
import { fetcher } from 'lib/utils'

export default function SignInPage() {
  const { data: config } = useSWR('/api/auth/config', fetcher)

  if (!config) return null

  return (
    <SignInComponent
      emailAndPasswordEnabled={config.emailAndPasswordEnabled}
      signUpEnabled={config.signUpEnabled}
      socialAuthenticationProviders={config.socialAuthenticationProviders ?? []}
      isFirstUser={config.isFirstUser}
    />
  )
}

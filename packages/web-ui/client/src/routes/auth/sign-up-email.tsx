import useSWR from 'swr'
import EmailSignUpComponent from '@/components/auth/email-sign-up'
import { fetcher } from 'lib/utils'

export default function SignUpEmailPage() {
  const { data: config } = useSWR('/api/auth/config', fetcher)

  if (!config) return null

  return <EmailSignUpComponent isFirstUser={config.isFirstUser} />
}

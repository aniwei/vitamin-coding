import { COOKIE_KEY_LOCALE } from '@/lib/const'

/**
 * Client-side locale getter — reads from cookie or defaults to browser language
 */
export async function getLocaleAction(): Promise<string> {
  // Try cookie first
  const cookieMatch = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${COOKIE_KEY_LOCALE}=`))
  if (cookieMatch) {
    return cookieMatch.split('=')[1] || 'en'
  }
  // Fallback to browser language
  const browserLang = navigator.language?.split('-')[0] || 'en'
  return browserLang
}

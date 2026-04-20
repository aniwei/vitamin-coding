/**
 * Drop-in replacement for next-intl's useTranslations.
 * Wraps react-i18next's useTranslation; supports namespace prefix.
 *
 * Usage is identical to next-intl:
 *   const t = useTranslations('Common')
 *   t('cancel')           // → Common.cancel
 *   t('Chat.title')       // → Common.Chat.title
 */
import { useTranslation } from 'react-i18next'

type TFunction = (key: string, options?: Record<string, unknown>) => string

export function useTranslations(namespace?: string): TFunction {
  const { t } = useTranslation()
  if (!namespace) return t as TFunction
  return (key: string, options?: Record<string, unknown>) =>
    t(`${namespace}.${key}`, options as any) as string
}

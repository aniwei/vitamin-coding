/**
 * Drop-in replacement for next-intl's useTranslations.
 * Wraps react-i18next's useTranslation; supports namespace prefix.
 *
 * Usage is identical to next-intl:
 *   const t = useTranslations('Common')
 *   t('cancel')           // → Common.cancel
 *   t.raw('toolKit')      // → raw object at Common.toolKit
 */
import { useTranslation } from 'react-i18next'

type TFunction = {
  (key: string, options?: Record<string, unknown>): string
  raw(key: string): unknown
}

export function useTranslations(namespace?: string): TFunction {
  const { t } = useTranslation()
  const translate = (key: string, options?: Record<string, unknown>) =>
    (namespace ? t(`${namespace}.${key}`, options as any) : t(key, options as any)) as string
  translate.raw = (key: string): unknown =>
    namespace ? t(`${namespace}.${key}`, { returnObjects: true }) : t(key, { returnObjects: true })
  return translate as unknown as TFunction
}


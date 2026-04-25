import { useTranslation } from "react-i18next"

/**
 * Hook for context-aware profile translations
 * Automatically selects appropriate translation namespace based on view context
 *
 * @param view - 'admin' for admin view, 'user' for user view
 * @returns Translation functions for the appropriate context
 */
export function useProfileTranslations(view: 'admin' | 'user' = 'user') {
  // Use the specific namespace based on view
  const { t } = useTranslation(`User.Profile.${view}`)
  const { t: tCommon } = useTranslation('User.Profile.common')

  return {
    /** Context-aware translations (admin vs user) */
    t,
    /** Common translations that don't change by context */
    tCommon,
  }
}

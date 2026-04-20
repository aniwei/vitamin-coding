import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import HttpBackend from 'i18next-http-backend'
import LanguageDetector from 'i18next-browser-languagedetector'

export const SUPPORTED_LOCALES = ['en', 'zh', 'ja', 'ko', 'fr', 'es', 'no'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export async function setupI18n() {
  await i18n
    .use(HttpBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      fallbackLng: 'en',
      supportedLngs: SUPPORTED_LOCALES as unknown as string[],
      defaultNS: 'translation',
      ns: ['translation'],
      load: 'languageOnly',
      detection: {
        order: ['querystring', 'cookie', 'navigator', 'htmlTag'],
        caches: ['cookie'],
        cookieMinutes: 60 * 24 * 365,
        lookupCookie: 'NEXT_LOCALE',
      },
      interpolation: { escapeValue: false },
      backend: {
        loadPath: '/locales/{{lng}}/translation.json',
      },
      returnNull: false,
    })
  return i18n
}

export { i18n }

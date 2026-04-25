export const IS_DEV = import.meta.env.DEV

export const IS_BROWSER = typeof window !== 'undefined'

export const PROMPT_PASTE_MAX_LENGTH = 1000

export const COOKIE_KEY_SIDEBAR_STATE = 'sidebar:state'

export const COOKIE_KEY_LOCALE = 'i18n:locale'

export const BASE_THEMES = [
  'default',
  'zinc',
  'slate',
  'stone',
  'gray',
  'blue',
  'orange',
  'pink',
  'bubblegum-pop',
  'cyberpunk-neon',
  'retro-arcade',
  'tropical-paradise',
  'steampunk-cogs',
  'neon-synthwave',
  'pastel-kawaii',
  'space-odyssey',
  'vintage-vinyl',
  'misty-harbor',
  'zen-garden',
]

export const OAUTH_REQUIRED_CODE = 'OAUTH_REQUIRED'

export const SUPPORTED_LOCALES = [
  { code: 'en', name: 'English 🇺🇸' },
  { code: 'ko', name: 'Korean 🇰🇷' },
  { code: 'es', name: 'Spanish 🇪🇸' },
  { code: 'fr', name: 'French 🇫🇷' },
  { code: 'ja', name: 'Japanese 🇯🇵' },
  { code: 'zh', name: 'Chinese 🇨🇳' },
  { code: 'no', name: 'Norwegian 🇳🇴' },
]

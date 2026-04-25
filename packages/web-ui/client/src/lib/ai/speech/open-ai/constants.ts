export const OPENAI_VOICE = {
  Alloy: 'alloy',
  Ballad: 'ballad',
  Sage: 'sage',
  Shimmer: 'shimmer',
  Verse: 'verse',
  Echo: 'echo',
  Coral: 'coral',
  Ash: 'ash',
} as const

export type OpenAIVoiceName = (typeof OPENAI_VOICE)[keyof typeof OPENAI_VOICE]

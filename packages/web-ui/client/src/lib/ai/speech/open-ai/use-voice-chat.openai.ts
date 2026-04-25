import { VoiceChatSession } from '@/lib/ai/speech'

export const OPENAI_VOICE = {
  Alloy: 'alloy',
  Ballad: 'ballad',
  Sage: 'sage',
} as const

export function useOpenAIVoiceChat(): VoiceChatSession {
  return {
    isActive: false,
    isListening: false,
    isUserSpeaking: false,
    isAssistantSpeaking: false,
    isLoading: false,
    messages: [],
    error: null,
    start: async () => {},
    stop: async () => {},
    startListening: async () => {},
    stopListening: async () => {},
  }
}

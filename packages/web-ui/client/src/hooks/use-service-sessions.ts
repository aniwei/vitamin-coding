/**
 * useServiceSessions — fetches session list from @vitamin/coding service
 * and maps it to the ChatThread[] shape used by the sidebar.
 */
import useSWR from 'swr'
import type { ChatThread } from '@/types/chat'
import { fetcher } from '@/lib/utils'

interface ServiceSession {
  id: string
  createdAt: string
  updatedAt?: string
  messageCount: number
  workingDirectory: string
  title: string
  status: string
}

async function fetchServiceSessions(): Promise<ChatThread[]> {
  const sessions: ServiceSession[] = await fetcher('/api/coding-service/api/sessions')
  return sessions.map((s) => ({
    id: s.id,
    title: s.title || s.id,
    userId: 'local',
    createdAt: new Date(s.createdAt),
  }))
}

export function useServiceSessions() {
  return useSWR<ChatThread[]>('service:sessions', fetchServiceSessions, {
    refreshInterval: 5000,
    fallbackData: [],
  })
}

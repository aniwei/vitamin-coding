/**
 * useServiceSessions — fetches session list from @vitamin/service
 * and maps it to the ChatThread[] shape used by the sidebar.
 *
 * Replaces the SWR /api/thread fetch when NEXT_PUBLIC_CHAT_BACKEND=service.
 */

import useSWR from 'swr'
import type { ChatThread } from '@/types/chat'

// HTTP requests go through the Next.js proxy rewrite (/api/coding-service/*)
// to avoid browser CORS issues. See next.config.ts rewrites.
const SERVICE_PROXY_BASE = '/api/coding-service'

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
  const res = await fetch(`${SERVICE_PROXY_BASE}/api/sessions`)
  if (!res.ok) return []
  const sessions: ServiceSession[] = await res.json()
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

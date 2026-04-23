import type { OpenDevChatMessage, TraceSessionInfo } from '../types/trace'

const API_BASE = '/api'

function normalizeTraceSession(raw: any): TraceSessionInfo {
  return {
    sessionId: raw.sessionId,
    title: raw.title,
    messageCount: raw.messageCount ?? 0,
    timestamp: raw.timestamp,
    workingDirectory: raw.workingDirectory,
  }
}

function normalizeTraceMessage(raw: any): OpenDevChatMessage {
  return {
    ...raw,
    toolCalls: raw.toolCalls,
    thinkingTrace: raw.thinkingTrace,
    reasoningContent: raw.reasoningContent,
    tokenUsage: raw.tokenUsage,
  }
}

export async function fetchTraceProjects(): Promise<string[]> {
  const response = await fetch(`${API_BASE}/traces/projects`)
  if (!response.ok) throw new Error(`API error: ${response.statusText}`)
  return response.json()
}

export async function fetchTraceSessions(project: string): Promise<TraceSessionInfo[]> {
  const response = await fetch(
    `${API_BASE}/traces/projects/${encodeURIComponent(project)}/sessions`,
  )
  if (!response.ok) throw new Error(`API error: ${response.statusText}`)
  const raw = await response.json()
  return Array.isArray(raw) ? raw.map(normalizeTraceSession) : []
}

export async function fetchTraceSession(
  project: string,
  sessionId: string,
): Promise<OpenDevChatMessage[]> {
  const response = await fetch(
    `${API_BASE}/traces/projects/${encodeURIComponent(project)}/sessions/${encodeURIComponent(sessionId)}`,
  )
  if (!response.ok) throw new Error(`API error: ${response.statusText}`)
  const raw = await response.json()
  return Array.isArray(raw) ? raw.map(normalizeTraceMessage) : []
}

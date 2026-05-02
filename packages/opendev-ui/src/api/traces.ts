import type { OpenDevChatMessage, TraceSessionInfo } from '../types/trace'
import { getJson } from './core'

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
  return getJson('/traces/projects')
}

export async function fetchTraceSessions(project: string): Promise<TraceSessionInfo[]> {
  const raw = await getJson<unknown>(`/traces/projects/${encodeURIComponent(project)}/sessions`)
  return Array.isArray(raw) ? raw.map(normalizeTraceSession) : []
}

export async function fetchTraceSession(
  project: string,
  sessionId: string,
): Promise<OpenDevChatMessage[]> {
  const raw = await getJson<unknown>(
    `/traces/projects/${encodeURIComponent(project)}/sessions/${encodeURIComponent(sessionId)}`,
  )
  return Array.isArray(raw) ? raw.map(normalizeTraceMessage) : []
}

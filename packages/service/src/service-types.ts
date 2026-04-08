import type { AgentSessionEvent, AgentSessionSubscriber } from '@vitamin/agent'
import type { Devtools } from '@vitamin/devtools'

/**
 * Minimal interface describing what @vitamin/service needs from an AgentSession.
 * Avoids a direct dependency on @vitamin/coding (which would be circular).
 */
export interface IServiceSession {
  readonly id: string
  prompt(text: string): Promise<void>
  resolveApproval(id: string, approved: boolean): void
  resolveAskUser(requestId: string, answers: Record<string, unknown> | null): void
  resolvePlanApproval(requestId: string, action: string, feedback?: string): void
  on(event: 'prompt_start', listener: (sessionId: string, text: string) => void): unknown
  on(event: 'prompt_end', listener: (sessionId: string) => void): unknown
  on(event: 'error', listener: (sessionId: string, error: Error) => void): unknown
  off(event: 'prompt_start', listener: (sessionId: string, text: string) => void): unknown
  off(event: 'prompt_end', listener: (sessionId: string) => void): unknown
  off(event: 'error', listener: (sessionId: string, error: Error) => void): unknown
  subscribe(subscriber: AgentSessionSubscriber): () => void
}

/**
 * Minimal interface describing what @vitamin/service needs from VitaminContext.
 * Avoids a direct dependency on @vitamin/coding (which would be circular).
 */
export interface IServiceContext {
  readonly devtools: Devtools | null | undefined
  getSession(id: string): IServiceSession | undefined
  readonly sessionManager: {
    readonly active: IServiceSession | undefined
  }
}

export type { AgentSessionEvent }

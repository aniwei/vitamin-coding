import { InMemorySession } from './in-memory-session'
import type { Session, SessionStore } from './types'

export class InMemorySessionStore<T = unknown> implements SessionStore<T> {
  private readonly sessions = new Map<string, Session<T>>()

  createSession(id = crypto.randomUUID()): Session<T> {
    const session = new InMemorySession<T>(id)
    this.sessions.set(id, session)
    return session
  }

  getSession(id: string): Session<T> | undefined {
    return this.sessions.get(id)
  }

  listSessions(): ReadonlyArray<Session<T>> {
    return Array.from(this.sessions.values())
  }
}

export function createInMemorySessionStore<T = unknown>(): SessionStore<T> {
  return new InMemorySessionStore<T>()
}

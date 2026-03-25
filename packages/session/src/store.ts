import { InMemorySession } from './in-memory-session'
import type { Session, SessionStore } from './types'

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Session>()

  createSession(id = crypto.randomUUID()): Session {
    const session = new InMemorySession(id)
    this.sessions.set(id, session)
    return session
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id)
  }

  listSessions(): ReadonlyArray<Session> {
    return Array.from(this.sessions.values())
  }
}

export function createInMemorySessionStore(): SessionStore {
  return new InMemorySessionStore()
}

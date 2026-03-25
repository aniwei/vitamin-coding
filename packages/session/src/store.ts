import { InMemorySession } from './in-memory-session'
import type { Session, SessionStore } from './types'

export class InMemorySessionStore<T = unknown> implements SessionStore<T> {
  private readonly sessions = new Map<string, InMemorySession<T>>()

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

  deleteSession(id: string): boolean {
    return this.sessions.delete(id)
  }

  /**
   * Fork — 从指定 session 的当前状态创建分支。
   * 复制所有 entries 到新 session，并记录分支来源。
   * 用于子 Agent 上下文隔离：子 Agent 不继承后续消息。
   */
  forkSession(sourceId: string, newId: string = crypto.randomUUID()): Session<T> | undefined {
    const source = this.sessions.get(sourceId)
    if (!source) return undefined

    const snapshot = source.toSnapshot()
    const forked = new InMemorySession<T>(newId, sourceId, snapshot.entries.length)

    // 复制所有源 entries
    forked.restoreEntries(
      [...snapshot.entries],
      {
        ...snapshot.metadata,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        parentSessionId: sourceId,
        forkPoint: snapshot.entries.length,
        tags: [...snapshot.metadata.tags, 'fork'],
      },
    )

    this.sessions.set(newId, forked)
    return forked
  }
}

export function createInMemorySessionStore<T = unknown>(): SessionStore<T> {
  return new InMemorySessionStore<T>()
}

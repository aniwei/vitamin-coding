export interface SessionMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  createdAt: Date
}

export interface Session {
  id: string
  appendUserMessage(content: string): void
  appendAssistantMessage(content: string): void
  appendSystemMessage(content: string): void
  messages(): ReadonlyArray<SessionMessage>
}

export interface SessionStore {
  createSession(id?: string): Session
  getSession(id: string): Session | undefined
  listSessions(): ReadonlyArray<Session>
}

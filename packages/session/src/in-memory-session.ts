import type { Session, SessionMessage } from './types'

function createMessage(role: SessionMessage['role'], content: string): SessionMessage {
  return {
    role,
    content,
    createdAt: new Date(),
  }
}

export class InMemorySession implements Session {
  private readonly sessionMessages: SessionMessage[] = []

  constructor(public readonly id: string) {}

  appendUserMessage(content: string): void {
    this.sessionMessages.push(createMessage('user', content))
  }

  appendAssistantMessage(content: string): void {
    this.sessionMessages.push(createMessage('assistant', content))
  }

  appendSystemMessage(content: string): void {
    this.sessionMessages.push(createMessage('system', content))
  }

  messages(): ReadonlyArray<SessionMessage> {
    return this.sessionMessages
  }
}

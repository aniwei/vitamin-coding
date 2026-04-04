import type { AgentSessionEvent, AgentSession } from '@vitamin/coding'
import type { StreamEvent, TextContent } from '@vitamin/ai'
import type { WebSocketMessage } from './types'
import type { WebSocketManager } from './websocket-manager'


export class EventBridge {
  constructor(
    private readonly session: AgentSession,
    private readonly ws: WebSocketManager,
  ) {}

  private onPrompStart = (_id: string, text: string) => {
    const sid = this.session.id
    this.send(sid, {
      type: 'user_message',
      data: { sessionId: sid, content: text, timestamp: new Date().toISOString() },
    })

    this.send(sid, {
      type: 'message_start',
      data: { sessionId: sid, role: 'assistant' },
    })
  }

  private onPromptEnd = () => {
    const sid = this.session.id
    this.send(sid, {
      type: 'message_complete',
      data: { sessionId: sid },
    })
  }

  private onError = (_id: string, error: Error) => {
    const sid = this.session.id
    this.send(sid, {
      type: 'error',
      data: { sessionId: sid, message: error.message }
    })
  }


  attach(): void {
    this.session.on('prompt_start', this.onPrompStart)
    this.session.on('prompt_end', this.onPromptEnd)
    this.session.on('error', this.onError)
  }

  handleStreamEvent(event: StreamEvent): void {
    const sid = this.session.id
    const messages = this.createMessageFromStreamEvent(sid, event)
    if (messages) {
      for (const msg of Array.isArray(messages) ? messages : [messages]) {
        this.send(sid, msg)
      }
    }
  }

  handleSessionEvent(event: AgentSessionEvent): void {
    const sid = this.session.id
    const messages = this.createMessageFromSessionEvent(sid, event)
    if (messages) {
      for (const msg of Array.isArray(messages) ? messages : [messages]) {
        this.send(sid, msg)
      }
    }
  }

  private send(sessionId: string, message: WebSocketMessage): void {
    this.ws.sendToSession(sessionId, message)
  }

  private createMessageFromStreamEvent(
    sessionId: string,
    event: StreamEvent,
  ): WebSocketMessage | WebSocketMessage[] | null {
    switch (event.type) {
      case 'text_delta':
        return {
          type: 'message_chunk',
          data: { sessionId, content: event.delta, role: 'assistant' },
        }

      case 'thinking_start':
        return {
          type: 'thinking_block',
          data: { sessionId, action: 'start', index: event.index },
        }

      case 'thinking_delta':
        return {
          type: 'thinking_block',
          data: { sessionId, action: 'delta', delta: event.delta, index: event.index },
        }

      case 'thinking_end':
        return {
          type: 'thinking_block',
          data: { sessionId, action: 'end', content: event.content, index: event.index },
        }

      case 'tool_call_end': {
        const tc = event.toolCall
        return {
          type: 'tool_call',
          data: {
            sessionId,
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments ?? {},
          },
        }
      }

      case 'done': {
        const events: WebSocketMessage[] = []

        const blocks = event.message.content.filter((b): b is TextContent => b.type === 'text')
        if (blocks.length > 0) {
          const fullText = blocks.map(b => b.text).join('')
          events.push({
            type: 'message_complete',
            data: { sessionId, content: fullText, role: 'assistant' },
          })
        }

        return events
      }
        
      case 'error':
        return {
          type: 'error',
          data: { sessionId, message: event.error.message }
        }

      default:
        return null
    }
  }

  private createMessageFromSessionEvent(
    sessionId: string,
    event: AgentSessionEvent,
  ): WebSocketMessage | WebSocketMessage[] | null {
    switch (event.type) {
      case 'tool_call_start':
        return {
          type: 'tool_call',
          data: {
            sessionId,
            id: event.toolCall.id,
            name: event.toolCall.name,
            arguments: event.toolCall.arguments,
            status: 'started',
          },
        }

      case 'tool_call_end':
        return {
          type: 'tool_result',
          data: {
            sessionId,
            id: event.toolCall.id,
            name: event.toolCall.name,
            isError: event.isError,
          },
        }

      case 'streaming_start':
        return {
          type: 'status_update',
          data: { sessionId, status: 'streaming', model: event.model },
        }

      case 'streaming_end':
        return {
          type: 'status_update',
          data: { sessionId, status: 'idle', model: event.model, stopReason: event.stopReason },
        }

      case 'turn_start':
        return {
          type: 'progress',
          data: { sessionId, phase: 'turn', turnIndex: event.turnIndex },
        }

      case 'compaction_start':
        return {
          type: 'status_update',
          data: { sessionId, status: 'compacting', messageCount: event.messageCount },
        }

      case 'compaction_end':
        return {
          type: 'status_update',
          data: { sessionId, status: 'idle', retainedCount: event.retainedCount },
        }

      case 'error':
        return {
          type: 'error',
          data: { sessionId, message: event.error.message },
        }

      default:
        return null
    }
  }

  detach(): void {
    this.session.off('prompt_start', this.onPrompStart)
    this.session.off('prompt_end', this.onPromptEnd)
    this.session.off('error', this.onError)
  }

  dispose(): void {
    this.detach()
  }
}

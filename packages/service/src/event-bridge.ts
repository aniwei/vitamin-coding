import type { AgentSessionEvent, AgentSession } from '@vitamin/coding'
import type { StreamEvent, AssistantMessage, TextContent } from '@vitamin/ai'
import type { WebSocketMessage } from './types'
import type { WebSocketManager } from './websocket-manager'

/**
 * Bridges AgentSession internal events → WebSocketManager WebSocket messages.
 *
 * One bridge per AgentSession. Listens to:
 *   - AgentSession events (prompt_start, prompt_end, error, etc.)
 *   - Agent StreamEvents (text deltas, thinking, tool calls)
 */
export class EventBridge {
  private readonly disposers: Array<() => void> = []

  constructor(
    private readonly session: AgentSession,
    private readonly ws: WebSocketManager,
  ) {}

  /** Start forwarding events for this session */
  attach(): void {
    const sid = this.session.id

    // Session-level events via TypedEventEmitter
    const offPromptStart = this.session.on('prompt_start', (_id, text) => {
      this.send(sid, {
        type: 'user_message',
        data: { sessionId: sid, content: text, timestamp: new Date().toISOString() },
      })
      this.send(sid, {
        type: 'message_start',
        data: { sessionId: sid, role: 'assistant' },
      })
    })

    const offPromptEnd = this.session.on('prompt_end', () => {
      this.send(sid, {
        type: 'message_complete',
        data: { sessionId: sid },
      })
    })

    const offError = this.session.on('error', (_id, error) => {
      this.send(sid, {
        type: 'error',
        data: { sessionId: sid, message: error.message },
      })
    })

    this.disposers.push(offPromptStart, offPromptEnd, offError)
  }

  /** Forward a StreamEvent from the Agent layer */
  handleStreamEvent(event: StreamEvent): void {
    const sid = this.session.id
    const mapped = this.mapStreamEvent(sid, event)
    if (mapped) {
      for (const msg of Array.isArray(mapped) ? mapped : [mapped]) {
        this.send(sid, msg)
      }
    }
  }

  /** Forward an AgentSessionEvent from the orchestrator */
  handleSessionEvent(event: AgentSessionEvent): void {
    const sid = this.session.id
    const mapped = this.mapSessionEvent(sid, event)
    if (mapped) {
      for (const msg of Array.isArray(mapped) ? mapped : [mapped]) {
        this.send(sid, msg)
      }
    }
  }

  detach(): void {
    for (const dispose of this.disposers) {
      dispose()
    }
    this.disposers.length = 0
  }

  private send(sessionId: string, message: WebSocketMessage): void {
    this.ws.sendToSession(sessionId, message)
  }

  private mapStreamEvent(
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

      case 'done':
        return this.mapDoneMessage(sessionId, event.message)

      case 'error':
        return {
          type: 'error',
          data: { sessionId, message: event.error.message },
        }

      default:
        return null
    }
  }

  private mapSessionEvent(
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

  private mapDoneMessage(
    sessionId: string,
    message: AssistantMessage,
  ): WebSocketMessage[] {
    const events: WebSocketMessage[] = []

    const textBlocks = message.content.filter(
      (b): b is TextContent => b.type === 'text',
    )
    if (textBlocks.length > 0) {
      const fullText = textBlocks.map((b) => b.text).join('')
      events.push({
        type: 'message_complete',
        data: { sessionId, content: fullText, role: 'assistant' },
      })
    }

    return events
  }
}
